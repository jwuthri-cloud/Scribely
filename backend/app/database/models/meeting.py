"""
Meeting model for Scribely.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    """Return naive UTC datetime for PostgreSQL TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MeetingStatusEnum(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Meeting(Base):
    """Meeting record — links a user to their stored transcript/recording on disk."""
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(255), nullable=True)
    # Recall SDK upload id — set for Recall-sourced meetings so the async
    # sdk_upload.complete webhook can attach the downloaded recording.
    recall_upload_id = Column(String(255), nullable=True, index=True)
    calendar_event_id = Column(
        String,
        ForeignKey("calendar_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    deal_id = Column(
        String,
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = Column(String(500), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    entry_count = Column(Integer, nullable=False, default=0)
    status = Column(
        VarcharEnum(32),
        default=MeetingStatusEnum.UPLOADED,
        nullable=False,
    )
    storage_path = Column(Text, nullable=False)

    recorded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False)

    user = relationship("User", backref="meetings")
    calendar_event = relationship("CalendarEvent", foreign_keys=[calendar_event_id])
    deal = relationship("Deal", foreign_keys=[deal_id])
    processing_state = relationship(
        "MeetingProcessing",
        back_populates="meeting",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_meetings_user_recorded", "user_id", "recorded_at"),
    )

    def __repr__(self):
        return f"<Meeting(id={self.id}, user_id={self.user_id}, status={self.status})>"
