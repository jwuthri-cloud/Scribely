"""
1:1 post-upload pipeline state for a meeting (diarization, enrichment, errors).
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
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PipelineEligibility(str, enum.Enum):
    """Whether the enrichment pipeline applies to this meeting."""

    SCHEDULED = "scheduled"  # recording present; pipeline will or did run
    NOT_APPLICABLE = "not_applicable"  # transcript-only upload; no recording


class MeetingProcessingStatus(str, enum.Enum):
    """Mirrors disk processing_status.json + task lifecycle."""

    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class MeetingProcessing(Base):
    """Pipeline outcomes and errors for one meeting (FK to meetings.id)."""

    __tablename__ = "meeting_processing"

    meeting_id = Column(
        String,
        ForeignKey("meetings.id", ondelete="CASCADE"),
        primary_key=True,
    )

    pipeline_eligibility = Column(
        VarcharEnum(32),
        default=PipelineEligibility.SCHEDULED,
        nullable=False,
    )

    processing_status = Column(
        VarcharEnum(32),
        default=MeetingProcessingStatus.NONE,
        nullable=False,
    )

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)

    diarization_provider = Column(String(32), nullable=True)
    utterance_count = Column(Integer, nullable=True)
    distinct_speaker_labels = Column(Integer, nullable=True)
    enriched_transcript_saved = Column(Boolean, default=False, nullable=False)
    has_nonempty_diarization = Column(Boolean, default=False, nullable=False)

    last_error_message = Column(Text, nullable=True)
    last_error_traceback = Column(Text, nullable=True)
    failed_step = Column(String(64), nullable=True)

    result_summary = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(
        DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False
    )

    meeting = relationship("Meeting", back_populates="processing_state")

    __table_args__ = (Index("ix_meeting_processing_status", "processing_status"),)

    def __repr__(self) -> str:
        return f"<MeetingProcessing(meeting_id={self.meeting_id}, status={self.processing_status})>"
