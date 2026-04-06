"""
Meeting model for Scribely.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..base import Base


def _utc_naive() -> datetime:
    """Return naive UTC datetime for PostgreSQL TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MeetingStatusEnum(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


def _enum_values(enum_cls: type[MeetingStatusEnum]) -> list[str]:
    return [m.value for m in enum_cls]


class Meeting(Base):
    """Meeting record — links a user to their stored transcript/recording on disk."""
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(255), nullable=True)
    title = Column(String(500), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    entry_count = Column(Integer, nullable=False, default=0)
    status = Column(
        SQLEnum(MeetingStatusEnum, name="meetingstatusenum", values_callable=_enum_values),
        default=MeetingStatusEnum.UPLOADED,
        nullable=False,
    )
    storage_path = Column(Text, nullable=False)

    recorded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False)

    user = relationship("User", backref="meetings")

    __table_args__ = (
        Index("ix_meetings_user_recorded", "user_id", "recorded_at"),
    )

    def __repr__(self):
        return f"<Meeting(id={self.id}, user_id={self.user_id}, status={self.status})>"
