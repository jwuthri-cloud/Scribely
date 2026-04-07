"""Web Push subscriptions and calendar reminder delivery deduplication."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint

from ..base import Base


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UserPushSubscription(Base):
    """Browser Web Push subscription (one row per endpoint per user)."""

    __tablename__ = "user_push_subscriptions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    user_agent = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False)


class CalendarReminderDelivery(Base):
    """Ensures we send at most one lead reminder per user per calendar event."""

    __tablename__ = "calendar_reminder_deliveries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    calendar_event_id = Column(
        String,
        ForeignKey("calendar_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reminder_kind = Column(String(32), nullable=False)  # e.g. "lead"

    created_at = Column(DateTime, default=_utc_naive, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "calendar_event_id",
            "reminder_kind",
            name="uq_calendar_reminder_delivery",
        ),
    )
