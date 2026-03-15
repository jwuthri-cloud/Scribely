"""
Meeting sync and post-processing endpoints.

Receives meeting data from the Electron desktop app after a meeting ends.
Accepts multipart/form-data with the transcript JSON file and optionally the
webm recording file. Files are stored under:
  {UPLOAD_DIR}/{user_id}/{meeting_id}/recording.webm
  {UPLOAD_DIR}/{user_id}/{meeting_id}/transcript.json

After upload, background diarization + speaker identification is triggered
automatically when a recording is present.
"""

import json
import uuid
from pathlib import Path
from typing import Any, Optional

import aiofiles
from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.user import User
from app.services.task_runner import TaskStatus, read_status, schedule_processing
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

logger = get_logger("meetings_api")

router = APIRouter()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class MeetingSyncResponse(BaseModel):
    success: bool
    message: str
    meetingId: Optional[str] = None


class ProcessingStatusResponse(BaseModel):
    meetingId: str
    status: str
    speakerMap: Optional[dict[str, str]] = None
    utteranceCount: Optional[int] = None
    error: Optional[str] = None
    updatedAt: Optional[str] = None


class EnrichedTranscriptResponse(BaseModel):
    meetingId: str
    hasEnrichedTranscript: bool
    transcript: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _meeting_dir(user_id: Any, meeting_id: str) -> Path:
    settings = get_settings()
    return Path(settings.upload_dir) / str(user_id) / meeting_id


def _validate_meeting_access(user: User, meeting_id: str) -> Path:
    """Return the meeting directory if it exists and belongs to the user."""
    meeting_dir = _meeting_dir(user.id, meeting_id)
    if not meeting_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id} not found",
        )
    return meeting_dir


# ---------------------------------------------------------------------------
# POST /  — upload meeting files
# ---------------------------------------------------------------------------

@router.post("/", response_model=MeetingSyncResponse)
async def sync_meeting(
    transcript: UploadFile = File(..., description="Transcript JSON file"),
    video: Optional[UploadFile] = File(None, description="Meeting recording (.webm)"),
    session_id: Optional[str] = Form(None, alias="sessionId"),
    user: User = Depends(get_current_user_with_db),
) -> MeetingSyncResponse:
    """
    Receive meeting files from the desktop app.

    Requires Clerk JWT authentication. Accepts multipart/form-data:
    - transcript (required): the transcript JSON file
    - video (optional): the webm recording file
    - sessionId (optional): meeting session identifier

    Files are stored at {UPLOAD_DIR}/{user_id}/{meeting_id}/
    When a video recording is included, background diarization + speaker
    identification is triggered automatically.
    """
    settings = get_settings()
    meeting_id = str(uuid.uuid4())
    upload_base = Path(settings.upload_dir)
    meeting_dir = upload_base / str(user.id) / meeting_id

    try:
        meeting_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.error(f"Failed to create upload directory {meeting_dir}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create storage directory",
        )

    # --- Save transcript JSON ---
    transcript_content = await transcript.read()
    if len(transcript_content) > settings.max_transcript_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Transcript file exceeds maximum allowed size ({settings.max_transcript_size_bytes // (1024*1024)}MB)",
        )

    transcript_path = meeting_dir / "transcript.json"
    async with aiofiles.open(transcript_path, "wb") as f:
        await f.write(transcript_content)

    logger.info(
        f"Transcript saved for user {user.id} (clerk={user.clerk_id}): "
        f"{len(transcript_content)} bytes → {transcript_path}"
    )

    # --- Save webm recording (optional) ---
    recording_path: Optional[Path] = None
    if video is not None:
        video_path = meeting_dir / "recording.webm"
        total_bytes = 0
        chunk_size = 1024 * 1024  # 1MB chunks

        async with aiofiles.open(video_path, "wb") as f:
            while True:
                chunk = await video.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.max_video_size_bytes:
                    await f.close()
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Video file exceeds maximum allowed size ({settings.max_video_size_bytes // (1024*1024)}MB)",
                    )
                await f.write(chunk)

        recording_path = video_path
        logger.info(
            f"Recording saved for user {user.id}: "
            f"{total_bytes / (1024*1024):.1f}MB → {recording_path}"
        )

    meeting_type = "transcript + recording" if recording_path else "transcript only"
    logger.info(
        f"Meeting {meeting_id} stored ({meeting_type}), "
        f"user={user.id}, session={session_id}"
    )

    # --- Trigger background processing if we have a recording ---
    if recording_path is not None:
        schedule_processing(meeting_dir)
        logger.info(f"Background diarization scheduled for meeting {meeting_id}")

    return MeetingSyncResponse(
        success=True,
        message=f"Meeting stored ({meeting_type})",
        meetingId=meeting_id,
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}/status  — processing status
# ---------------------------------------------------------------------------

@router.get("/{meeting_id}/status", response_model=ProcessingStatusResponse)
async def get_processing_status(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
) -> ProcessingStatusResponse:
    """Return the diarization / speaker-identification processing status."""
    meeting_dir = _validate_meeting_access(user, meeting_id)
    info = read_status(meeting_dir)

    return ProcessingStatusResponse(
        meetingId=meeting_id,
        status=info.get("status", "none"),
        speakerMap=info.get("speakerMap"),
        utteranceCount=info.get("utteranceCount"),
        error=info.get("error"),
        updatedAt=info.get("updatedAt"),
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}/transcript  — enriched (or original) transcript
# ---------------------------------------------------------------------------

@router.get("/{meeting_id}/transcript", response_model=EnrichedTranscriptResponse)
async def get_transcript(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
) -> EnrichedTranscriptResponse:
    """Return the enriched transcript if available, otherwise the original."""
    meeting_dir = _validate_meeting_access(user, meeting_id)

    enriched_path = meeting_dir / "transcript_enriched.json"
    original_path = meeting_dir / "transcript.json"

    if enriched_path.exists():
        data = json.loads(enriched_path.read_text())
        return EnrichedTranscriptResponse(
            meetingId=meeting_id,
            hasEnrichedTranscript=True,
            transcript=data,
        )

    if original_path.exists():
        data = json.loads(original_path.read_text())
        return EnrichedTranscriptResponse(
            meetingId=meeting_id,
            hasEnrichedTranscript=False,
            transcript=data,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No transcript found for this meeting",
    )


# ---------------------------------------------------------------------------
# POST /{meeting_id}/reprocess  — manually re-trigger processing
# ---------------------------------------------------------------------------

@router.post("/{meeting_id}/reprocess", response_model=ProcessingStatusResponse)
async def reprocess_meeting(
    meeting_id: str,
    provider: Optional[str] = None,
    user: User = Depends(get_current_user_with_db),
) -> ProcessingStatusResponse:
    """Manually re-trigger diarization + speaker identification.

    Optionally override the diarization provider (``deepgram`` or ``assemblyai``).
    """
    meeting_dir = _validate_meeting_access(user, meeting_id)

    recording_path = meeting_dir / "recording.webm"
    if not recording_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recording available for this meeting — cannot process",
        )

    scheduled = schedule_processing(meeting_dir, provider)
    current = read_status(meeting_dir)

    return ProcessingStatusResponse(
        meetingId=meeting_id,
        status=current.get("status", "pending") if scheduled else "already_processing",
        updatedAt=current.get("updatedAt"),
    )
