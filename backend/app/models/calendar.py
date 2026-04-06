"""Pydantic schemas for calendar API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CalendarParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email: str
    display_name: Optional[str] = None
    is_organizer: bool = False
    response_status: str
    is_self: bool = False


class CalendarEventSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: Optional[str] = None
    start_time: datetime
    end_time: datetime
    timezone: str
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    meeting_platform: str
    organizer_email: Optional[str] = None
    organizer_name: Optional[str] = None
    status: str
    is_recurring: bool = False


class CalendarEventDetailOut(CalendarEventSummaryOut):
    description: Optional[str] = None
    participants: List[CalendarParticipantOut] = Field(default_factory=list)


class CalendarConnectionStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    connected: bool
    provider: Optional[str] = None
    status: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    webhook_expires_at: Optional[datetime] = None
    last_error: Optional[str] = None


class CalendarEventListOut(BaseModel):
    events: List[CalendarEventSummaryOut]
    total: int
    page: int
    limit: int
    pages: int


class CalendarConnectResponse(BaseModel):
    connection_id: str
    webhook_expiration: Optional[str] = None


class CalendarSyncResponse(BaseModel):
    ok: bool
    message: str = "synced"
