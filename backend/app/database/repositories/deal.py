"""Repository for Deal model operations."""

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.contact import Contact
from ..models.deal import Deal, DealStatusEnum
from ..models.meeting import Meeting

logger = get_logger("deal_repository")


class DealRepository:
    """Data access for Deal rows."""

    @staticmethod
    async def get_or_create(
        db: AsyncSession,
        user_id: str,
        domain: str,
        *,
        default_name: Optional[str] = None,
    ) -> Deal:
        stmt = select(Deal).where(
            Deal.user_id == user_id,
            Deal.domain == domain,
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is not None:
            return row

        row = Deal(
            user_id=user_id,
            domain=domain,
            name=default_name or domain,
            status=DealStatusEnum.ACTIVE,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
        logger.info(f"Created deal: {row.id} ({domain}) for user {user_id}")
        return row

    @staticmethod
    async def get_by_id(
        db: AsyncSession, deal_id: str, user_id: Optional[str] = None
    ) -> Optional[Deal]:
        stmt = select(Deal).where(Deal.id == deal_id)
        if user_id:
            stmt = stmt.where(Deal.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_user(
        db: AsyncSession, user_id: str
    ) -> list[tuple[Deal, int, int]]:
        """Return [(deal, contact_count, meeting_count), ...] for a user."""
        contact_counts = (
            select(Contact.deal_id, func.count(Contact.id).label("c"))
            .where(Contact.user_id == user_id, Contact.deal_id.is_not(None))
            .group_by(Contact.deal_id)
            .subquery()
        )
        meeting_counts = (
            select(Meeting.deal_id, func.count(Meeting.id).label("m"))
            .where(Meeting.user_id == user_id, Meeting.deal_id.is_not(None))
            .group_by(Meeting.deal_id)
            .subquery()
        )
        stmt = (
            select(
                Deal,
                func.coalesce(contact_counts.c.c, 0),
                func.coalesce(meeting_counts.c.m, 0),
            )
            .outerjoin(contact_counts, contact_counts.c.deal_id == Deal.id)
            .outerjoin(meeting_counts, meeting_counts.c.deal_id == Deal.id)
            .where(Deal.user_id == user_id)
            .order_by(Deal.updated_at.desc())
        )
        result = await db.execute(stmt)
        return [(row[0], int(row[1]), int(row[2])) for row in result.all()]
