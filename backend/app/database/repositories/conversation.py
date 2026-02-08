"""
Conversation repository for AssistMe.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...utils.logging import get_logger
from ..models.conversation import Conversation, ConversationStatusEnum

logger = get_logger("conversation_repository")


class ConversationRepository:
    """Repository for Conversation model operations."""

    @staticmethod
    async def create(
        db: AsyncSession,
        user_id: str,
        title: Optional[str] = None,
        agent_type: Optional[str] = None,
        model_name: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> Conversation:
        """Create a new conversation."""
        conversation = Conversation(
            user_id=user_id,
            title=title,
            agent_type=agent_type,
            model_name=model_name,
            metadata=metadata or {}
        )
        db.add(conversation)
        await db.flush()
        await db.refresh(conversation)
        logger.info(f"Created conversation: {conversation.id} for user: {user_id}")
        return conversation

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        conversation_id: str,
        include_messages: bool = False
    ) -> Optional[Conversation]:
        """Get conversation by ID, optionally with messages."""
        query = select(Conversation).where(Conversation.id == conversation_id)
        if include_messages:
            query = query.options(selectinload(Conversation.messages))
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_user(
        db: AsyncSession,
        user_id: str,
        status: Optional[ConversationStatusEnum] = None,
        agent_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Conversation]:
        """Get conversations for a user with optional filtering."""
        query = select(Conversation).where(Conversation.user_id == user_id)

        if status:
            query = query.where(Conversation.status == status)
        if agent_type:
            query = query.where(Conversation.agent_type == agent_type)

        query = query.order_by(desc(Conversation.updated_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_active_by_user(
        db: AsyncSession,
        user_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[Conversation]:
        """Get active conversations for a user."""
        return await ConversationRepository.get_by_user(
            db, user_id, status=ConversationStatusEnum.ACTIVE, skip=skip, limit=limit
        )

    @staticmethod
    async def update(
        db: AsyncSession,
        conversation_id: str,
        **kwargs
    ) -> Optional[Conversation]:
        """Update conversation."""
        conversation = await ConversationRepository.get_by_id(db, conversation_id)
        if not conversation:
            return None

        for key, value in kwargs.items():
            if hasattr(conversation, key):
                setattr(conversation, key, value)

        conversation.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(conversation)
        return conversation

    @staticmethod
    async def update_last_message_at(
        db: AsyncSession,
        conversation_id: str
    ) -> Optional[Conversation]:
        """Update conversation's last message timestamp."""
        conversation = await ConversationRepository.get_by_id(db, conversation_id)
        if conversation:
            conversation.last_message_at = datetime.utcnow()
            conversation.updated_at = datetime.utcnow()
            await db.flush()
            await db.refresh(conversation)
        return conversation

    @staticmethod
    async def archive(db: AsyncSession, conversation_id: str) -> Optional[Conversation]:
        """Archive a conversation."""
        return await ConversationRepository.update(
            db, conversation_id, status=ConversationStatusEnum.ARCHIVED
        )

    @staticmethod
    async def delete(db: AsyncSession, conversation_id: str, soft: bool = True) -> bool:
        """Delete or soft-delete a conversation."""
        conversation = await ConversationRepository.get_by_id(db, conversation_id)
        if not conversation:
            return False

        if soft:
            conversation.status = ConversationStatusEnum.DELETED
            conversation.updated_at = datetime.utcnow()
            await db.flush()
        else:
            await db.delete(conversation)
            await db.flush()

        logger.info(f"{'Soft-' if soft else ''}Deleted conversation: {conversation_id}")
        return True

    @staticmethod
    async def count_by_user(
        db: AsyncSession,
        user_id: str,
        status: Optional[ConversationStatusEnum] = None
    ) -> int:
        """Count conversations for a user."""
        from sqlalchemy import func

        query = select(func.count()).select_from(Conversation).where(
            Conversation.user_id == user_id
        )
        if status:
            query = query.where(Conversation.status == status)

        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def set_title_from_first_message(
        db: AsyncSession,
        conversation_id: str,
        message_content: str,
        max_length: int = 100
    ) -> Optional[Conversation]:
        """Generate and set title from first message content."""
        # Truncate and clean up the content for a title
        title = message_content.strip()
        if len(title) > max_length:
            title = title[:max_length - 3] + "..."

        return await ConversationRepository.update(db, conversation_id, title=title)
