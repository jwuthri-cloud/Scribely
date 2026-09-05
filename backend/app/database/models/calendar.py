"""
Calendar integration models (Google Calendar sync).
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CalendarConnectionStatus(str, enum.Enum):
    ACTIVE = "active"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    PENDING_REAUTH = "pending_reauth"


class MeetingPlatform(str, enum.Enum):
    GOOGLE_MEET = "google_meet"
    ZOOM = "zoom"
    TEAMS = "teams"
    OTHER = "other"
    NONE = "none"


class CalendarEventStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    TENTATIVE = "tentative"
    CANCELLED = "cancelled"


class ParticipantResponseStatus(str, enum.Enum):
    ACCEPTED = "accepted"
    DECLINED = "declined"
    TENTATIVE = "tentative"
    NEEDS_ACTION = "needs_action"


class CalendarConnection(Base):
    """Per-user Google (or future provider) calendar connection + webhook state."""

    __tablename__ = "calendar_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider = Column(String(20), nullable=False)  # "google"

    sync_token = Column(Text, nullable=True)
    webhook_channel_id = Column(String(255), nullable=True)
    webhook_resource_id = Column(String(255), nullable=True)
    webhook_expiration = Column(DateTime, nullable=True)

    status = Column(
        VarcharEnum(32),
        default=CalendarConnectionStatus.ACTIVE,
        nullable=False,
    )
    last_synced_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(
        DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False
    )

    user = relationship("User", backref="calendar_connections")
    events = relationship(
        "CalendarEvent", back_populates="connection", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "provider", name="uq_calendar_connections_user_provider"
        ),
    )


class CalendarEvent(Base):
    """Synced calendar event from Google Calendar."""

    __tablename__ = "calendar_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    calendar_connection_id = Column(
        String,
        ForeignKey("calendar_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    google_event_id = Column(String(255), nullable=False)
    title = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    timezone = Column(String(100), nullable=False, default="UTC")
    location = Column(String(500), nullable=True)

    meeting_url = Column(String(1000), nullable=True)
    meeting_platform = Column(
        VarcharEnum(32),
        default=MeetingPlatform.NONE,
        nullable=False,
    )

    organizer_email = Column(String(255), nullable=True)
    organizer_name = Column(String(255), nullable=True)

    status = Column(
        VarcharEnum(32),
        default=CalendarEventStatus.CONFIRMED,
        nullable=False,
    )
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurring_event_id = Column(String(255), nullable=True)

    raw_data = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(
        DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False
    )

    connection = relationship("CalendarConnection", back_populates="events")
    user = relationship("User", backref="calendar_events")
    participants = relationship(
        "CalendarEventParticipant",
        back_populates="event",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "google_event_id", name="uq_calendar_events_user_google_event"
        ),
        Index("ix_calendar_events_user_start", "user_id", "start_time"),
    )


class CalendarEventParticipant(Base):
    """Attendee on a synced calendar event."""

    __tablename__ = "calendar_event_participants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    calendar_event_id = Column(
        String,
        ForeignKey("calendar_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    is_organizer = Column(Boolean, default=False, nullable=False)
    response_status = Column(
        VarcharEnum(32),
        default=ParticipantResponseStatus.NEEDS_ACTION,
        nullable=False,
    )
    is_self = Column(Boolean, default=False, nullable=False)

    event = relationship("CalendarEvent", back_populates="participants")
