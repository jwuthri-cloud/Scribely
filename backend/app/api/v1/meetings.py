"""
Meeting sync endpoint.

Receives meeting data from the Electron desktop app after a meeting ends.
Accepts multipart/form-data with the transcript JSON file and optionally the
webm recording file. Files are stored under:
  {UPLOAD_DIR}/{user_id}/{meeting_id}/recording.webm
  {UPLOAD_DIR}/{user_id}/{meeting_id}/transcript.json
"""

import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.user import User
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

logger = get_logger("meetings_api")

router = APIRouter()


class MeetingSyncResponse(BaseModel):
    success: bool
    message: str
    meetingId: Optional[str] = None


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
        # Read in chunks to handle large files without excessive memory usage
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
                    # Clean up partial file
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

    return MeetingSyncResponse(
        success=True,
        message=f"Meeting stored ({meeting_type})",
        meetingId=meeting_id,
    )
