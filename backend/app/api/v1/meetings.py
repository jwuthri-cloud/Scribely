"""
Meeting sync endpoint.

Receives meeting data from the Electron desktop app after a meeting ends.
For now this only validates the payload and confirms receipt; meeting storage
will be added in a later iteration.
"""

from typing import Any, Dict, List, Optional

from app.api.deps import get_current_user_with_db
from app.database.models.user import User
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

logger = get_logger("meetings_api")

router = APIRouter()


class TranscriptEntry(BaseModel):
    id: str
    speaker: str
    text: str
    startTime: float
    endTime: float
    source: str


class MeetingSummary(BaseModel):
    totalEntries: int
    speakers: List[str]
    durationMs: float


class MeetingSyncRequest(BaseModel):
    sessionId: Optional[str] = Field(None, description="Meeting session ID")
    recordingFilepath: Optional[str] = Field(None, description="Local path to recording file")
    entries: List[TranscriptEntry] = Field(default_factory=list, description="Transcript entries")
    summary: Optional[MeetingSummary] = Field(None, description="Meeting summary stats")


class MeetingSyncResponse(BaseModel):
    success: bool
    message: str
    meetingId: Optional[str] = None


@router.post("/", response_model=MeetingSyncResponse)
async def sync_meeting(
    payload: MeetingSyncRequest,
    user: User = Depends(get_current_user_with_db),
) -> MeetingSyncResponse:
    """
    Receive meeting data from the desktop app.

    Requires Clerk JWT authentication. The user is automatically upserted
    into the local database on first request.

    For now this endpoint accepts and acknowledges the payload without
    persisting meeting data (no meetings table yet).
    """
    entry_count = len(payload.entries)
    speakers = payload.summary.speakers if payload.summary else []
    duration_ms = payload.summary.durationMs if payload.summary else 0

    logger.info(
        f"Meeting sync from user {user.id} (clerk={user.clerk_id}): "
        f"{entry_count} entries, {len(speakers)} speakers, "
        f"{duration_ms / 1000:.1f}s duration, session={payload.sessionId}"
    )

    return MeetingSyncResponse(
        success=True,
        message=f"Meeting received ({entry_count} transcript entries)",
    )
