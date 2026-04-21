"""Repository for Contact model operations."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.contact import Contact

logger = get_logger("contact_repository")


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ContactRepository:
    """Data access for Contact rows."""

    @staticmethod
    async def get_by_email(
        db: AsyncSession, user_id: str, email: str
    ) -> Optional[Contact]:
        stmt = select(Contact).where(
            Contact.user_id == user_id,
            Contact.email == email.lower(),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def upsert(
        db: AsyncSession,
        user_id: str,
        email: str,
        *,
        full_name: Optional[str] = None,
        deal_id: Optional[str] = None,
        touch_last_seen: bool = True,
    ) -> Contact:
        email = email.lower()
        row = await ContactRepository.get_by_email(db, user_id, email)
        if row is None:
            row = Contact(
                user_id=user_id,
                email=email,
                full_name=full_name,
                deal_id=deal_id,
            )
            db.add(row)
        else:
            if full_name and not row.full_name:
                row.full_name = full_name
            if deal_id and not row.deal_id:
                row.deal_id = deal_id
            if touch_last_seen:
                row.last_seen_at = _utc_naive()
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def attach_deal(
        db: AsyncSession, contact_id: str, deal_id: str
    ) -> Optional[Contact]:
        stmt = select(Contact).where(Contact.id == contact_id)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        row.deal_id = deal_id
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def set_deal_for_user(
        db: AsyncSession,
        user_id: str,
        contact_id: str,
        deal_id: Optional[str],
    ) -> Optional[Contact]:
        """Set or clear ``deal_id`` when the contact belongs to ``user_id``.

        When ``deal_id`` is set, the deal must exist and belong to the same user.
        """
        from ..models.deal import Deal

        contact = await ContactRepository.get_by_id(db, contact_id, user_id=user_id)
        if contact is None:
            return None
        if deal_id is not None:
            dres = await db.execute(
                select(Deal).where(Deal.id == deal_id, Deal.user_id == user_id)
            )
            if dres.scalar_one_or_none() is None:
                return None
        contact.deal_id = deal_id
        contact.updated_at = _utc_naive()
        await db.flush()
        await db.refresh(contact)
        return contact

    @staticmethod
    async def get_by_id(
        db: AsyncSession, contact_id: str, user_id: Optional[str] = None
    ) -> Optional[Contact]:
        stmt = select(Contact).where(Contact.id == contact_id)
        if user_id:
            stmt = stmt.where(Contact.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        deal_id: Optional[str] = None,
    ) -> list[Contact]:
        stmt = select(Contact).where(Contact.user_id == user_id)
        if deal_id is not None:
            stmt = stmt.where(Contact.deal_id == deal_id)
        stmt = stmt.order_by(Contact.last_seen_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_for_deal(
        db: AsyncSession, user_id: str, deal_id: str
    ) -> list[Contact]:
        return await ContactRepository.list_for_user(db, user_id, deal_id=deal_id)
