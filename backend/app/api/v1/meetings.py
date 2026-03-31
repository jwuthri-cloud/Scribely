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
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import aiofiles
from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.meeting import MeetingStatusEnum
from app.database.models.user import User
from app.database.repositories.meeting import MeetingRepository
from app.database.session import get_async_db_session
from app.services.task_runner import TaskStatus, read_status, schedule_processing
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

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


class MeetingSummaryResponse(BaseModel):
    id: str
    title: Optional[str] = None
    duration_seconds: Optional[int] = None
    entry_count: int
    status: str
    recorded_at: Optional[str] = None
    created_at: str


class PaginatedMeetingsResponse(BaseModel):
    meetings: list[MeetingSummaryResponse]
    total: int
    page: int
    limit: int
    pages: int


class MonthlyMeetingCount(BaseModel):
    month: str
    count: int


class DashboardStatsResponse(BaseModel):
    total_meetings: int
    total_duration_seconds: int
    total_transcript_lines: int
    completed_count: int
    processing_count: int
    recent_meetings: list[MeetingSummaryResponse]
    meetings_per_month: list[MonthlyMeetingCount]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _resolve_meeting_dir(
    db: AsyncSession,
    user: User,
    meeting_id: str,
) -> Path:
    """Return the on-disk meeting directory after DB + filesystem checks.

    The meeting list is backed by the database; transcript/status/reprocess need
    files under ``{upload_dir}/{storage_path}``. If the row exists but the folder
    does not (wrong ``UPLOAD_DIR``, wiped uploads, DB restored without files),
    raise 404 with a message that distinguishes that from an unknown id.
    """
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    settings = get_settings()
    meeting_dir = Path(settings.upload_dir) / meeting.storage_path
    if not meeting_dir.is_dir():
        logger.warning(
            "Meeting %s has DB row but missing directory: %s (upload_dir=%s)",
            meeting_id,
            meeting_dir,
            settings.upload_dir,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Transcript files for this meeting are not on this server. "
                "Check that UPLOAD_DIR matches where the desktop app uploaded files, "
                "or re-sync the meeting."
            ),
        )
    return meeting_dir


# ---------------------------------------------------------------------------
# GET /  — list meetings for current user (paginated)
# ---------------------------------------------------------------------------

@router.get("/", response_model=PaginatedMeetingsResponse)
async def list_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=200),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    meeting_status: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> PaginatedMeetingsResponse:
    """List meetings for the authenticated user with pagination and filters."""
    meetings, total = await MeetingRepository.list_for_user(
        db,
        user.id,
        page=page,
        limit=limit,
        search=search,
        date_from=date_from,
        date_to=date_to,
        status=meeting_status,
    )

    pages = math.ceil(total / limit) if total > 0 else 0

    return PaginatedMeetingsResponse(
        meetings=[
            MeetingSummaryResponse(
                id=m.id,
                title=m.title,
                duration_seconds=m.duration_seconds,
                entry_count=m.entry_count,
                status=m.status.value if isinstance(m.status, MeetingStatusEnum) else str(m.status),
                recorded_at=m.recorded_at.isoformat() if m.recorded_at else None,
                created_at=m.created_at.isoformat(),
            )
            for m in meetings
        ],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# GET /stats  — aggregated dashboard stats
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> DashboardStatsResponse:
    """Return aggregated meeting statistics for the dashboard."""
    total_meetings = await MeetingRepository.count_for_user(db, user.id)
    total_duration = await MeetingRepository.total_duration_for_user(db, user.id)
    total_lines = await MeetingRepository.total_entry_count_for_user(db, user.id)
    status_counts = await MeetingRepository.count_by_status_for_user(db, user.id)
    per_month = await MeetingRepository.meetings_per_month_for_user(db, user.id)

    recent, _ = await MeetingRepository.list_for_user(db, user.id, page=1, limit=5)

    return DashboardStatsResponse(
        total_meetings=total_meetings,
        total_duration_seconds=total_duration,
        total_transcript_lines=total_lines,
        completed_count=status_counts.get("completed", 0),
        processing_count=status_counts.get("processing", 0),
        recent_meetings=[
            MeetingSummaryResponse(
                id=m.id,
                title=m.title,
                duration_seconds=m.duration_seconds,
                entry_count=m.entry_count,
                status=m.status.value if isinstance(m.status, MeetingStatusEnum) else str(m.status),
                recorded_at=m.recorded_at.isoformat() if m.recorded_at else None,
                created_at=m.created_at.isoformat(),
            )
            for m in recent
        ],
        meetings_per_month=[
            MonthlyMeetingCount(month=row["month"], count=row["count"])
            for row in per_month
        ],
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}  — single meeting metadata
# ---------------------------------------------------------------------------


@router.get("/{meeting_id}", response_model=MeetingSummaryResponse)
async def get_meeting(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> MeetingSummaryResponse:
    """Return one meeting's summary row for the current user."""
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    return MeetingSummaryResponse(
        id=meeting.id,
        title=meeting.title,
        duration_seconds=meeting.duration_seconds,
        entry_count=meeting.entry_count,
        status=meeting.status.value if isinstance(meeting.status, MeetingStatusEnum) else str(meeting.status),
        recorded_at=meeting.recorded_at.isoformat() if meeting.recorded_at else None,
        created_at=meeting.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# POST /  — upload meeting files
# ---------------------------------------------------------------------------

@router.post("/", response_model=MeetingSyncResponse)
async def sync_meeting(
    transcript: UploadFile = File(..., description="Transcript JSON file"),
    video: Optional[UploadFile] = File(None, description="Meeting recording (.webm)"),
    session_id: Optional[str] = Form(None, alias="sessionId"),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
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

    # --- Create DB record ---
    entry_count = 0
    duration_seconds = None
    recorded_at = None
    title = None
    try:
        transcript_data = json.loads(transcript_content)
        entries = transcript_data if isinstance(transcript_data, list) else transcript_data.get("entries", [])
        entry_count = len(entries)
        if entries:
            first_ts = entries[0].get("timestamp", 0)
            last_ts = entries[-1].get("timestamp", 0)
            if isinstance(last_ts, (int, float)) and isinstance(first_ts, (int, float)):
                duration_seconds = max(0, int(last_ts - first_ts))
        meta = transcript_data.get("metadata", {}) if isinstance(transcript_data, dict) else {}
        title = meta.get("title")
        if meta.get("startTime"):
            try:
                recorded_at = datetime.fromisoformat(meta["startTime"].replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, AttributeError):
                pass
    except (json.JSONDecodeError, KeyError, TypeError):
        pass

    if recorded_at is None:
        recorded_at = datetime.now(timezone.utc).replace(tzinfo=None)

    initial_status = MeetingStatusEnum.PROCESSING if recording_path else MeetingStatusEnum.COMPLETED
    storage_rel = f"{user.id}/{meeting_id}"

    db_meeting = await MeetingRepository.create(
        db,
        user_id=user.id,
        storage_path=storage_rel,
        session_id=session_id,
        title=title,
        duration_seconds=duration_seconds,
        entry_count=entry_count,
        status=initial_status,
        recorded_at=recorded_at,
    )
    await db.commit()

    # --- Trigger background processing if we have a recording ---
    if recording_path is not None:
        schedule_processing(meeting_dir, meeting_id=db_meeting.id)
        logger.info(f"Background diarization scheduled for meeting {meeting_id} (db_id={db_meeting.id})")

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
    db: AsyncSession = Depends(get_async_db_session),
) -> ProcessingStatusResponse:
    """Return the diarization / speaker-identification processing status."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)
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
    db: AsyncSession = Depends(get_async_db_session),
) -> EnrichedTranscriptResponse:
    """Return the enriched transcript if available, otherwise the original."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)

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
    db: AsyncSession = Depends(get_async_db_session),
) -> ProcessingStatusResponse:
    """Manually re-trigger diarization + speaker identification.

    Optionally override the diarization provider (``deepgram`` or ``assemblyai``).
    """
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)

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
