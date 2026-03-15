"""Lightweight async background task runner for meeting post-processing.

Each meeting gets a ``processing_status.json`` file in its directory that
tracks the current state.  No external broker (Redis/Celery) is needed —
tasks run as ``asyncio.Task`` objects in the same event loop as the FastAPI
server.
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


# In-flight tasks keyed by meeting_dir string to prevent duplicate processing
_active_tasks: dict[str, asyncio.Task[None]] = {}


def schedule_processing(meeting_dir: Path, provider: str | None = None) -> bool:
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
    task = asyncio.create_task(_run(meeting_dir, provider))
    _active_tasks[key] = task

    # Auto-cleanup when done
    task.add_done_callback(lambda _t: _active_tasks.pop(key, None))

    logger.info(f"Scheduled processing for {meeting_dir.name}")
    return True


async def _run(meeting_dir: Path, provider: str | None) -> None:
    from app.services.meeting_processor import process_meeting

    _write_status(meeting_dir, TaskStatus.PROCESSING, startedAt=datetime.now(timezone.utc).isoformat())

    try:
        result = await process_meeting(meeting_dir, provider)
        speaker_map = result.get("diarization", {}).get("speakerMap", {})
        utterance_count = result.get("diarization", {}).get("utteranceCount", 0)

        _write_status(
            meeting_dir,
            TaskStatus.COMPLETED,
            speakerMap=speaker_map,
            utteranceCount=utterance_count,
            completedAt=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"Processing completed for {meeting_dir.name}")

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"Processing failed for {meeting_dir.name}: {e}\n{tb}")
        _write_status(
            meeting_dir,
            TaskStatus.FAILED,
            error=str(e),
            failedAt=datetime.now(timezone.utc).isoformat(),
        )
