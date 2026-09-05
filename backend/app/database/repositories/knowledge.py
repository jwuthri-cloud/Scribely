"""Repository for ContactKnowledge model operations."""

from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.knowledge import ContactKnowledge, KnowledgeCategoryEnum

logger = get_logger("knowledge_repository")


class ContactKnowledgeRepository:
    """Data access for ContactKnowledge rows."""

    @staticmethod
    async def bulk_create(
        db: AsyncSession,
        *,
        user_id: str,
        meeting_id: str,
        deal_id: Optional[str],
        entries: Iterable[dict],
    ) -> list[ContactKnowledge]:
        """Create multiple knowledge rows.

        Each ``entry`` dict expects: ``contact_id``, ``fact``, ``category``,
        ``confidence``, and optional ``source_snippet``.
        """
        rows: list[ContactKnowledge] = []
        for entry in entries:
            category = entry.get("category", KnowledgeCategoryEnum.OTHER)
            if isinstance(category, str):
                try:
                    category = KnowledgeCategoryEnum(category)
                except ValueError:
                    category = KnowledgeCategoryEnum.OTHER
            row = ContactKnowledge(
                user_id=user_id,
                contact_id=entry["contact_id"],
                deal_id=deal_id,
                meeting_id=meeting_id,
                fact=entry["fact"],
                category=category,
                confidence=float(entry.get("confidence", 0.5)),
                source_snippet=entry.get("source_snippet"),
            )
            db.add(row)
            rows.append(row)
        await db.flush()
        for row in rows:
            await db.refresh(row)
        logger.info(f"Created {len(rows)} knowledge entries for meeting {meeting_id}")
        return rows

    @staticmethod
    async def list_for_contact(
        db: AsyncSession, user_id: str, contact_id: str
    ) -> list[ContactKnowledge]:
        stmt = (
            select(ContactKnowledge)
            .where(
                ContactKnowledge.user_id == user_id,
                ContactKnowledge.contact_id == contact_id,
            )
            .order_by(ContactKnowledge.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_for_deal(
        db: AsyncSession, user_id: str, deal_id: str
    ) -> list[ContactKnowledge]:
        stmt = (
            select(ContactKnowledge)
            .where(
                ContactKnowledge.user_id == user_id,
                ContactKnowledge.deal_id == deal_id,
            )
            .order_by(ContactKnowledge.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_for_meeting(
        db: AsyncSession, user_id: str, meeting_id: str
    ) -> list[ContactKnowledge]:
        stmt = (
            select(ContactKnowledge)
            .where(
                ContactKnowledge.user_id == user_id,
                ContactKnowledge.meeting_id == meeting_id,
            )
            .order_by(ContactKnowledge.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
