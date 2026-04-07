"""Lightweight async background task runner for meeting post-processing.

Each meeting gets a ``processing_status.json`` file in its directory that
tracks the current state.  No external broker (Redis/Celery) is needed —
tasks run as ``asyncio.Task`` objects in the same event loop as the FastAPI
server.

Pipeline outcomes and errors are also persisted to ``meeting_processing`` (DB).
"""

from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from app.utils.logging import get_logger

logger = get_logger("task_runner")


async def _finalize_success(
    meeting_id: str,
    result: dict[str, Any],
    duration_seconds: int | None,
) -> None:
    from app.database.models.meeting import MeetingStatusEnum
    from app.database.repositories.meeting import MeetingRepository
    from app.database.repositories.meeting_processing import MeetingProcessingRepository
    from app.database.session import get_async_session

    raw_di = result.get("diarization", {})
    di: dict[str, Any] = raw_di if isinstance(raw_di, dict) else {}
    utts = di.get("utterances") or []
    uc = len(utts) if isinstance(utts, list) else 0
    speaker_keys: set[str] = set()
    for u in utts:
        if isinstance(u, dict):
            label = u.get("originalLabel") or u.get("speaker")
            if isinstance(label, str) and label:
                speaker_keys.add(label)
    distinct = len(speaker_keys)
    provider = str(di.get("provider") or "")
    if len(provider) > 32:
        provider = provider[:32]

    sm = di.get("speakerMap")
    summary: dict[str, Any] = {}
    if isinstance(sm, dict):
        summary["speaker_map_size"] = len(sm)

    async with get_async_session() as db:
        await MeetingRepository.update_after_processing(
            db, meeting_id, MeetingStatusEnum.COMPLETED, duration_seconds
        )
        await MeetingProcessingRepository.mark_completed(
            db,
            meeting_id,
            provider=provider or "unknown",
            utterance_count=uc,
            distinct_speaker_labels=distinct,
            enriched_transcript_saved=True,
            has_nonempty_diarization=uc > 0,
            result_summary=summary or None,
        )
        await db.commit()
    logger.info(f"DB updated for meeting {meeting_id}: completed, duration={duration_seconds}s")


async def _finalize_failure(
    meeting_id: str,
    exc: BaseException,
    tb: str,
) -> None:
    from app.database.models.meeting import MeetingStatusEnum
    from app.database.repositories.meeting import MeetingRepository
    from app.database.repositories.meeting_processing import MeetingProcessingRepository
    from app.database.session import get_async_session

    step = getattr(exc, "step", None)
    msg = str(exc)

    async with get_async_session() as db:
        await MeetingRepository.update_after_processing(db, meeting_id, MeetingStatusEnum.FAILED, None)
        await MeetingProcessingRepository.mark_failed(
            db,
            meeting_id,
            message=msg,
            failed_step=step,
            traceback_str=tb,
        )
        await db.commit()
    logger.info(f"DB updated for meeting {meeting_id}: failed step={step}")


async def _mark_processing_started(meeting_id: str) -> None:
    from app.database.repositories.meeting_processing import MeetingProcessingRepository
    from app.database.session import get_async_session

    try:
        async with get_async_session() as db:
            await MeetingProcessingRepository.mark_processing(db, meeting_id)
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to mark processing started for {meeting_id}: {e}")


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


def _status_path(meeting_dir: Path) -> Path:
    return meeting_dir / "processing_status.json"


def read_status(meeting_dir: Path) -> dict[str, Any]:
    """Read the processing status for a meeting directory."""
    path = _status_path(meeting_dir)
    if not path.exists():
        return {"status": "none"}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"status": "unknown"}


def _write_status(meeting_dir: Path, status: TaskStatus, **extra: Any) -> None:
    payload = {
        "status": status.value,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    _status_path(meeting_dir).write_text(json.dumps(payload, indent=2))
    try:
        from app.infrastructure.object_storage import (
            derive_storage_path,
            is_object_storage_configured,
            mirror_processing_status_json,
        )

        if is_object_storage_configured():
            mirror_processing_status_json(meeting_dir, derive_storage_path(meeting_dir))
    except Exception as e:
        logger.warning("Failed to mirror processing_status.json to object storage: %s", e)


# In-flight tasks keyed by meeting_dir string to prevent duplicate processing
_active_tasks: dict[str, asyncio.Task[None]] = {}


def schedule_processing(meeting_dir: Path, meeting_id: str | None = None, provider: str | None = None) -> bool:
    """Schedule background meeting processing.

    Returns ``True`` if a new task was created, ``False`` if one is already
    running for this meeting.
    """
    key = str(meeting_dir)
    existing = _active_tasks.get(key)
    if existing and not existing.done():
        logger.info(f"Processing already in progress for {meeting_dir.name}")
        return False

    _write_status(meeting_dir, TaskStatus.PENDING)
    task = asyncio.create_task(_run(meeting_dir, meeting_id, provider))
    _active_tasks[key] = task

    # Auto-cleanup when done
    task.add_done_callback(lambda _t: _active_tasks.pop(key, None))

    logger.info(f"Scheduled processing for {meeting_dir.name}")
    return True


async def _run(meeting_dir: Path, meeting_id: str | None, provider: str | None) -> None:
    from app.services.meeting_processor import process_meeting
    from app.services.pipeline_errors import PipelineStepError

    _write_status(meeting_dir, TaskStatus.PROCESSING, startedAt=datetime.now(timezone.utc).isoformat())

    if meeting_id:
        await _mark_processing_started(meeting_id)

    try:
        result = await process_meeting(meeting_dir, provider, meeting_id=meeting_id)
        diarization = result.get("diarization", {})
        speaker_map = diarization.get("speakerMap", {})
        utterance_count = diarization.get("utteranceCount", 0)

        utterances = diarization.get("utterances", [])
        duration_seconds: int | None = None
        if utterances:
            last_end_ms = utterances[-1].get("endMs", 0)
            if isinstance(last_end_ms, (int, float)) and last_end_ms > 0:
                duration_seconds = max(1, int(last_end_ms / 1000))

        _write_status(
            meeting_dir,
            TaskStatus.COMPLETED,
            speakerMap=speaker_map,
            utteranceCount=utterance_count,
            completedAt=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"Processing completed for {meeting_dir.name}")

        try:
            from app.infrastructure.object_storage import (
                TRANSCRIPT_ENRICHED_JSON,
                derive_storage_path,
                is_object_storage_configured,
                upload_file_sync,
            )

            if is_object_storage_configured():
                enriched = meeting_dir / TRANSCRIPT_ENRICHED_JSON
                if enriched.is_file():
                    upload_file_sync(
                        enriched,
                        derive_storage_path(meeting_dir),
                        TRANSCRIPT_ENRICHED_JSON,
                    )
        except Exception as e:
            logger.warning("Failed to upload enriched transcript to object storage: %s", e)

        if meeting_id:
            await _finalize_success(meeting_id, result, duration_seconds)

    except PipelineStepError as e:
        tb = traceback.format_exc()
        logger.error(f"Processing failed (step={e.step}) for {meeting_dir.name}: {e}\n{tb}")
        _write_status(
            meeting_dir,
            TaskStatus.FAILED,
            error=str(e),
            failedStep=e.step,
            failedAt=datetime.now(timezone.utc).isoformat(),
        )
        if meeting_id:
            await _finalize_failure(meeting_id, e, tb)

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"Processing failed for {meeting_dir.name}: {e}\n{tb}")
        _write_status(
            meeting_dir,
            TaskStatus.FAILED,
            error=str(e),
            failedAt=datetime.now(timezone.utc).isoformat(),
        )
        if meeting_id:
            await _finalize_failure(meeting_id, e, tb)

