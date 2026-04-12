"""
Repository for calendar sync tables.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models.calendar import (
    CalendarConnection,
    CalendarConnectionStatus,
    CalendarEvent,
    CalendarEventParticipant,
    CalendarEventStatus,
    MeetingPlatform,
    ParticipantResponseStatus,
)
from app.utils.logging import get_logger

logger = get_logger("calendar_repository")


class CalendarRepository:
    """Data access for calendar connections and events."""

    @staticmethod
    async def get_connection_by_user_provider(
        db: AsyncSession,
        user_id: str,
        provider: str,
    ) -> Optional[CalendarConnection]:
        stmt = select(CalendarConnection).where(
            CalendarConnection.user_id == user_id,
            CalendarConnection.provider == provider,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_connection_by_webhook_channel(
        db: AsyncSession,
        channel_id: str,
    ) -> Optional[CalendarConnection]:
        stmt = select(CalendarConnection).where(
            CalendarConnection.webhook_channel_id == channel_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_or_update_connection(
        db: AsyncSession,
        user_id: str,
        provider: str,
        *,
        sync_token: Optional[str] = None,
        webhook_channel_id: Optional[str] = None,
        webhook_resource_id: Optional[str] = None,
        webhook_expiration: Optional[datetime] = None,
        status: CalendarConnectionStatus = CalendarConnectionStatus.ACTIVE,
        last_synced_at: Optional[datetime] = None,
        last_error: Optional[str] = None,
    ) -> CalendarConnection:
        row = await CalendarRepository.get_connection_by_user_provider(db, user_id, provider)
        if row is None:
            row = CalendarConnection(
                user_id=user_id,
                provider=provider,
                sync_token=sync_token,
                webhook_channel_id=webhook_channel_id,
                webhook_resource_id=webhook_resource_id,
                webhook_expiration=webhook_expiration,
                status=status,
                last_synced_at=last_synced_at,
                last_error=last_error,
            )
            db.add(row)
        else:
            if sync_token is not None:
                row.sync_token = sync_token
            if webhook_channel_id is not None:
                row.webhook_channel_id = webhook_channel_id
            if webhook_resource_id is not None:
                row.webhook_resource_id = webhook_resource_id
            if webhook_expiration is not None:
                row.webhook_expiration = webhook_expiration
            row.status = status
            if last_synced_at is not None:
                row.last_synced_at = last_synced_at
            if last_error is not None:
                row.last_error = last_error
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def upsert_event(
        db: AsyncSession,
        user_id: str,
        calendar_connection_id: str,
        google_event_id: str,
        *,
        title: Optional[str],
        description: Optional[str],
        start_time: datetime,
        end_time: datetime,
        timezone: str,
        location: Optional[str],
        meeting_url: Optional[str],
        meeting_platform: MeetingPlatform,
        organizer_email: Optional[str],
        organizer_name: Optional[str],
        status: CalendarEventStatus,
        is_recurring: bool,
        recurring_event_id: Optional[str],
        raw_data: Optional[dict],
    ) -> CalendarEvent:
        stmt = select(CalendarEvent).where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.google_event_id == google_event_id,
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()

        if row is None:
            row = CalendarEvent(
                user_id=user_id,
                calendar_connection_id=calendar_connection_id,
                google_event_id=google_event_id,
                title=title,
                description=description,
                start_time=start_time,
                end_time=end_time,
                timezone=timezone,
                location=location,
                meeting_url=meeting_url,
                meeting_platform=meeting_platform,
                organizer_email=organizer_email,
                organizer_name=organizer_name,
                status=status,
                is_recurring=is_recurring,
                recurring_event_id=recurring_event_id,
                raw_data=raw_data,
            )
            db.add(row)
        else:
            row.calendar_connection_id = calendar_connection_id
            row.title = title
            row.description = description
            row.start_time = start_time
            row.end_time = end_time
            row.timezone = timezone
            row.location = location
            row.meeting_url = meeting_url
            row.meeting_platform = meeting_platform
            row.organizer_email = organizer_email
            row.organizer_name = organizer_name
            row.status = status
            row.is_recurring = is_recurring
            row.recurring_event_id = recurring_event_id
            row.raw_data = raw_data

        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def replace_participants(
        db: AsyncSession,
        calendar_event_id: str,
        participants: list[dict],
    ) -> None:
        """Replace all participants for an event (delete + insert)."""
        await db.execute(
            delete(CalendarEventParticipant).where(
                CalendarEventParticipant.calendar_event_id == calendar_event_id
            )
        )
        for p in participants:
            rs = p.get("response_status", ParticipantResponseStatus.NEEDS_ACTION)
            if isinstance(rs, str):
                rs = ParticipantResponseStatus(rs)
            db.add(
                CalendarEventParticipant(
                    calendar_event_id=calendar_event_id,
                    email=p["email"],
                    display_name=p.get("display_name"),
                    is_organizer=bool(p.get("is_organizer", False)),
                    response_status=rs,
                    is_self=bool(p.get("is_self", False)),
                )
            )
        await db.flush()

    @staticmethod
    async def get_event_by_id(
        db: AsyncSession,
        event_id: str,
        user_id: str,
        *,
        with_participants: bool = True,
    ) -> Optional[CalendarEvent]:
        stmt = select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == user_id,
        )
        if with_participants:
            stmt = stmt.options(selectinload(CalendarEvent.participants))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_connections_expiring_webhook_before(
        db: AsyncSession,
        before: datetime,
    ) -> list[CalendarConnection]:
        """Connections with active webhooks expiring before ``before``."""
        stmt = select(CalendarConnection).where(
            CalendarConnection.provider == "google",
            CalendarConnection.status == CalendarConnectionStatus.ACTIVE,
            CalendarConnection.webhook_expiration.is_not(None),
            CalendarConnection.webhook_expiration < before,
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_events_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        start_from: Optional[datetime] = None,
        end_before: Optional[datetime] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[CalendarEvent], int]:
        base = select(CalendarEvent).where(CalendarEvent.user_id == user_id)
        count_stmt = select(func.count(CalendarEvent.id)).where(CalendarEvent.user_id == user_id)

        if start_from is not None:
            base = base.where(CalendarEvent.start_time >= start_from)
            count_stmt = count_stmt.where(CalendarEvent.start_time >= start_from)
        if end_before is not None:
            base = base.where(CalendarEvent.start_time <= end_before)
            count_stmt = count_stmt.where(CalendarEvent.start_time <= end_before)
        if search:
            like = f"%{search}%"
            base = base.where(CalendarEvent.title.ilike(like))
            count_stmt = count_stmt.where(CalendarEvent.title.ilike(like))

        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        stmt = (
            base.order_by(CalendarEvent.start_time.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
        return rows, total

    @staticmethod
    async def list_overlapping_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        range_start: datetime,
        range_end: datetime,
        limit: int = 20,
    ) -> list[CalendarEvent]:
        """
        Events whose [start_time, end_time] overlaps ``[range_start, range_end]``.

        Overlap condition: start_time < range_end AND end_time > range_start
        """
        if range_end <= range_start:
            return []

        stmt = (
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.status != CalendarEventStatus.CANCELLED,
                CalendarEvent.start_time < range_end,
                CalendarEvent.end_time > range_start,
            )
            .order_by(CalendarEvent.start_time.asc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_upcoming_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        now: datetime,
        limit: int = 20,
    ) -> list[CalendarEvent]:
        stmt = (
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time >= now,
                CalendarEvent.status != CalendarEventStatus.CANCELLED,
            )
            .order_by(CalendarEvent.start_time.asc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
