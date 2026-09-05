"""Contact model — an external person we've met with, identified by email."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..base import Base


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Contact(Base):
    """External meeting participant tracked per-user."""

    __tablename__ = "contacts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    deal_id = Column(
        String,
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    first_seen_at = Column(DateTime, default=_utc_naive, nullable=False)
    last_seen_at = Column(DateTime, default=_utc_naive, nullable=False)
    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(
        DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False
    )

    user = relationship("User", backref="contacts")
    deal = relationship("Deal", back_populates="contacts")

    __table_args__ = (
        UniqueConstraint("user_id", "email", name="uq_contacts_user_email"),
    )

    def __repr__(self) -> str:
        return f"<Contact(id={self.id}, email={self.email})>"
