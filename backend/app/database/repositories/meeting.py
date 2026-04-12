"""
Meeting repository for Scribely.
"""

import math
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.meeting import Meeting, MeetingStatusEnum

logger = get_logger("meeting_repository")


class MeetingRepository:
    """Repository for Meeting model operations."""

    @staticmethod
    async def create(
        db: AsyncSession,
        user_id: str,
        storage_path: str,
        *,
        id: Optional[str] = None,
        session_id: Optional[str] = None,
        calendar_event_id: Optional[str] = None,
        title: Optional[str] = None,
        duration_seconds: Optional[int] = None,
        entry_count: int = 0,
        status: MeetingStatusEnum = MeetingStatusEnum.UPLOADED,
        recorded_at: Optional[datetime] = None,
    ) -> Meeting:
        row_id = id if id is not None else str(uuid.uuid4())
        meeting = Meeting(
            id=row_id,
            user_id=user_id,
            storage_path=storage_path,
            session_id=session_id,
            calendar_event_id=calendar_event_id,
            title=title,
            duration_seconds=duration_seconds,
            entry_count=entry_count,
            status=status,
            recorded_at=recorded_at,
        )
        db.add(meeting)
        await db.flush()
        await db.refresh(meeting)
        logger.info(f"Created meeting: {meeting.id} for user {user_id}")
        return meeting

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        meeting_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[Meeting]:
        stmt = select(Meeting).where(Meeting.id == meeting_id)
        if user_id:
            stmt = stmt.where(Meeting.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
    ) -> tuple[list[Meeting], int]:
        """Return (meetings, total_count) for a user with filters."""
        base = select(Meeting).where(Meeting.user_id == user_id)
        count_base = select(func.count(Meeting.id)).where(Meeting.user_id == user_id)

        if search:
            like = f"%{search}%"
            base = base.where(Meeting.title.ilike(like))
            count_base = count_base.where(Meeting.title.ilike(like))

        if date_from:
            base = base.where(Meeting.recorded_at >= date_from)
            count_base = count_base.where(Meeting.recorded_at >= date_from)

        if date_to:
            base = base.where(Meeting.recorded_at <= date_to)
            count_base = count_base.where(Meeting.recorded_at <= date_to)

        if status:
            base = base.where(Meeting.status == status)
            count_base = count_base.where(Meeting.status == status)

        total_result = await db.execute(count_base)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        stmt = base.order_by(Meeting.recorded_at.desc().nullslast(), Meeting.created_at.desc()).offset(offset).limit(limit)
        result = await db.execute(stmt)
        meetings = list(result.scalars().all())

        return meetings, total

    @staticmethod
    async def update_status(
        db: AsyncSession,
        meeting_id: str,
        status: MeetingStatusEnum,
    ) -> Optional[Meeting]:
        meeting = await MeetingRepository.get_by_id(db, meeting_id)
        if meeting:
            meeting.status = status
            await db.flush()
            await db.refresh(meeting)
        return meeting

    @staticmethod
    async def update_after_processing(
        db: AsyncSession,
        meeting_id: str,
        status: MeetingStatusEnum,
        duration_seconds: Optional[int] = None,
    ) -> Optional[Meeting]:
        meeting = await MeetingRepository.get_by_id(db, meeting_id)
        if meeting:
            meeting.status = status
            if duration_seconds is not None:
                meeting.duration_seconds = duration_seconds
            await db.flush()
            await db.refresh(meeting)
        return meeting

    @staticmethod
    async def update_entry_count(
        db: AsyncSession,
        meeting_id: str,
        entry_count: int,
    ) -> Optional[Meeting]:
        meeting = await MeetingRepository.get_by_id(db, meeting_id)
        if meeting:
            meeting.entry_count = entry_count
            await db.flush()
            await db.refresh(meeting)
        return meeting

    @staticmethod
    async def count_for_user(db: AsyncSession, user_id: str) -> int:
        result = await db.execute(
            select(func.count(Meeting.id)).where(Meeting.user_id == user_id)
        )
        return result.scalar() or 0

    @staticmethod
    async def total_duration_for_user(db: AsyncSession, user_id: str) -> int:
        result = await db.execute(
            select(func.coalesce(func.sum(Meeting.duration_seconds), 0)).where(Meeting.user_id == user_id)
        )
        return result.scalar() or 0

    @staticmethod
    async def total_entry_count_for_user(db: AsyncSession, user_id: str) -> int:
        result = await db.execute(
            select(func.coalesce(func.sum(Meeting.entry_count), 0)).where(Meeting.user_id == user_id)
        )
        return result.scalar() or 0

    @staticmethod
    async def count_by_status_for_user(db: AsyncSession, user_id: str) -> dict[str, int]:
        """Return {status_value: count} for a user's meetings."""
        stmt = (
            select(Meeting.status, func.count(Meeting.id))
            .where(Meeting.user_id == user_id)
            .group_by(Meeting.status)
        )
        result = await db.execute(stmt)
        return {
            (row[0].value if isinstance(row[0], MeetingStatusEnum) else str(row[0])): row[1]
            for row in result.all()
        }

    @staticmethod
    async def meetings_per_month_for_user(
        db: AsyncSession, user_id: str, months: int = 12
    ) -> list[dict[str, object]]:
        """Return meeting counts grouped by month for the last N months.

        SQLite uses ``strftime``; PostgreSQL uses ``to_char``. Returns list of
        ``{"month": "2026-03", "count": 5}`` dicts ordered chronologically.
        """
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            month_expr = func.to_char(Meeting.recorded_at, "YYYY-MM")
        else:
            month_expr = func.strftime("%Y-%m", Meeting.recorded_at)
        cutoff = datetime.utcnow().replace(day=1) - timedelta(days=30 * (months - 1))

        stmt = (
            select(month_expr.label("month"), func.count(Meeting.id).label("cnt"))
            .where(Meeting.user_id == user_id, Meeting.recorded_at >= cutoff)
            .group_by("month")
            .order_by("month")
        )
        result = await db.execute(stmt)
        return [{"month": row.month, "count": row.cnt} for row in result.all()]
