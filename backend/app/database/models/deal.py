"""Deal model — auto-detected customer/prospect grouped by email domain."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DealStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class Deal(Base):
    """A Deal groups contacts and meetings by their shared email domain."""

    __tablename__ = "deals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(
        VarcharEnum(32),
        default=DealStatusEnum.ACTIVE,
        nullable=False,
    )
    extra_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(
        DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False
    )

    user = relationship("User", backref="deals")
    contacts = relationship("Contact", back_populates="deal")

    __table_args__ = (
        UniqueConstraint("user_id", "domain", name="uq_deals_user_domain"),
    )

    def __repr__(self) -> str:
        return f"<Deal(id={self.id}, domain={self.domain})>"
