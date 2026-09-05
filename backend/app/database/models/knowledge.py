"""ContactKnowledge — facts we learned about a contact during a meeting."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class KnowledgeCategoryEnum(str, enum.Enum):
    ROLE = "role"
    PREFERENCE = "preference"
    PAIN_POINT = "pain_point"
    GOAL = "goal"
    PERSONAL = "personal"
    OTHER = "other"


class ContactKnowledge(Base):
    """One durable fact extracted about a contact from a meeting transcript."""

    __tablename__ = "contact_knowledge"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id = Column(
        String,
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    deal_id = Column(
        String,
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    meeting_id = Column(
        String,
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    fact = Column(Text, nullable=False)
    category = Column(
        VarcharEnum(32),
        default=KnowledgeCategoryEnum.OTHER,
        nullable=False,
    )
    confidence = Column(Float, nullable=False, default=0.5)
    source_snippet = Column(Text, nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)

    contact = relationship("Contact", backref="knowledge_entries")
    deal = relationship("Deal")
    meeting = relationship("Meeting", backref="knowledge_entries")

    __table_args__ = (
        Index("ix_contact_knowledge_user_contact", "user_id", "contact_id"),
        Index("ix_contact_knowledge_meeting", "meeting_id"),
    )

    def __repr__(self) -> str:
        return f"<ContactKnowledge(id={self.id}, contact_id={self.contact_id})>"
