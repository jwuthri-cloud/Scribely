#!/usr/bin/env python3
"""Best-effort backfill of ``meeting_processing`` from on-disk ``processing_status.json``.

Usage::

    cd backend && uv run python scripts/backfill_meeting_processing.py [--dry-run] [--force]

``--force`` overwrites rows that are already ``completed`` in the DB.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--force", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


_STATUS_MAP = {
    "none": "none",
    "pending": "pending",
    "processing": "processing",
    "completed": "completed",
    "failed": "failed",
    "unknown": "none",
}


async def main_async(force: bool, dry_run: bool) -> int:
    from app.config import get_settings
    from app.database.models.meeting_processing import (
        MeetingProcessing,
        MeetingProcessingStatus,
        PipelineEligibility,
    )
    from app.database.repositories.meeting import MeetingRepository
    from app.database.repositories.meeting_processing import MeetingProcessingRepository
    from app.database.session import get_async_session

    settings = get_settings()
    base = Path(settings.upload_dir)
    if not base.is_dir():
        print(f"Upload dir missing: {base}", file=sys.stderr)
        return 1

    updated = 0
    skipped = 0

    for user_dir in sorted(base.iterdir()):
        if not user_dir.is_dir():
            continue
        for meeting_dir in sorted(user_dir.iterdir()):
            if not meeting_dir.is_dir():
                continue
            status_path = meeting_dir / "processing_status.json"
            if not status_path.is_file():
                continue
            meeting_id = meeting_dir.name
            try:
                raw = json.loads(status_path.read_text())
            except (json.JSONDecodeError, OSError):
                continue

            disk_status = str(raw.get("status") or "none")
            key = _STATUS_MAP.get(disk_status, "none")
            try:
                proc_status = MeetingProcessingStatus(key)
            except ValueError:
                proc_status = MeetingProcessingStatus.NONE

            async with get_async_session() as db:
                meeting = await MeetingRepository.get_by_id(db, meeting_id)
                if not meeting:
                    skipped += 1
                    continue

                existing = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
                if (
                    existing
                    and existing.processing_status == MeetingProcessingStatus.COMPLETED
                    and not force
                ):
                    skipped += 1
                    continue

                if dry_run:
                    print(f"would upsert {meeting_id} -> {proc_status.value}")
                    updated += 1
                    continue

                now = _utc_naive()
                row = existing
                if row is None:
                    row = MeetingProcessing(meeting_id=meeting_id, created_at=now, updated_at=now)
                    db.add(row)

                row.pipeline_eligibility = PipelineEligibility.SCHEDULED
                row.processing_status = proc_status
                row.last_error_message = raw.get("error")
                row.failed_step = raw.get("failedStep")
                uc = raw.get("utteranceCount")
                if isinstance(uc, int):
                    row.utterance_count = uc
                if proc_status == MeetingProcessingStatus.COMPLETED:
                    row.completed_at = now
                    row.enriched_transcript_saved = True
                    row.has_nonempty_diarization = bool(uc and uc > 0)
                elif proc_status == MeetingProcessingStatus.FAILED:
                    row.failed_at = now

                row.updated_at = now
                await db.commit()
                updated += 1

    print(f"Done. updated={updated} skipped={skipped}")
    return 0


def main() -> None:
    args = _parse_args()
    raise SystemExit(asyncio.run(main_async(args.force, args.dry_run)))


if __name__ == "__main__":
    main()
