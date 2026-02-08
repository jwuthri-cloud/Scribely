"""
Message repository for AssistMe.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.message import Message, MessageRoleEnum

logger = get_logger("message_repository")


class MessageRepository:
    """Repository for Message model operations."""

    @staticmethod
    async def create(
        db: AsyncSession,
        conversation_id: str,
        role: MessageRoleEnum,
        content: str,
        model: Optional[str] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_call_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        latency_ms: Optional[int] = None,
        structured_output: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Create a new message."""
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            model=model,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            latency_ms=latency_ms,
            structured_output=structured_output,
            metadata=metadata or {}
        )
        db.add(message)
        await db.flush()
        await db.refresh(message)
        logger.debug(f"Created message: {message.id} in conversation: {conversation_id}")
        return message

    @staticmethod
    async def create_user_message(
        db: AsyncSession,
        conversation_id: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Create a user message."""
        return await MessageRepository.create(
            db=db,
            conversation_id=conversation_id,
            role=MessageRoleEnum.USER,
            content=content,
            metadata=metadata
        )

    @staticmethod
    async def create_assistant_message(
        db: AsyncSession,
        conversation_id: str,
        content: str,
        model: Optional[str] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        latency_ms: Optional[int] = None,
        structured_output: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Create an assistant message."""
        return await MessageRepository.create(
            db=db,
            conversation_id=conversation_id,
            role=MessageRoleEnum.ASSISTANT,
            content=content,
            model=model,
            tool_calls=tool_calls,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            latency_ms=latency_ms,
            structured_output=structured_output,
            metadata=metadata
        )

    @staticmethod
    async def create_tool_message(
        db: AsyncSession,
        conversation_id: str,
        content: str,
        tool_call_id: str,
        tool_name: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Create a tool response message."""
        return await MessageRepository.create(
            db=db,
            conversation_id=conversation_id,
            role=MessageRoleEnum.TOOL,
            content=content,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            metadata=metadata
        )

    @staticmethod
    async def get_by_id(db: AsyncSession, message_id: str) -> Optional[Message]:
        """Get message by ID."""
        result = await db.execute(select(Message).where(Message.id == message_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_conversation(
        db: AsyncSession,
        conversation_id: str,
        role: Optional[MessageRoleEnum] = None,
        skip: int = 0,
        limit: Optional[int] = None,
        order: str = "asc"
    ) -> List[Message]:
        """Get messages for a conversation with optional filtering."""
        query = select(Message).where(Message.conversation_id == conversation_id)

        if role:
            query = query.where(Message.role == role)

        # Order by created_at
        if order == "desc":
            query = query.order_by(desc(Message.created_at))
        else:
            query = query.order_by(asc(Message.created_at))

        query = query.offset(skip)
        if limit:
            query = query.limit(limit)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_recent_messages(
        db: AsyncSession,
        conversation_id: str,
        limit: int = 10
    ) -> List[Message]:
        """Get the most recent messages in a conversation (in chronological order)."""
        # Get recent messages in descending order, then reverse
        messages = await MessageRepository.get_by_conversation(
            db, conversation_id, limit=limit, order="desc"
        )
        return list(reversed(messages))

    @staticmethod
    async def get_context_window(
        db: AsyncSession,
        conversation_id: str,
        max_messages: int = 20,
        include_system: bool = True
    ) -> List[Message]:
        """
        Get messages for context window (for LLM input).

        Returns messages in chronological order, optionally including system messages.
        """
        query = select(Message).where(Message.conversation_id == conversation_id)

        if not include_system:
            query = query.where(Message.role != MessageRoleEnum.SYSTEM)

        query = query.order_by(desc(Message.created_at)).limit(max_messages)
        result = await db.execute(query)
        messages = list(result.scalars().all())

        # Return in chronological order
        return list(reversed(messages))

    @staticmethod
    async def count_by_conversation(
        db: AsyncSession,
        conversation_id: str,
        role: Optional[MessageRoleEnum] = None
    ) -> int:
        """Count messages in a conversation."""
        from sqlalchemy import func

        query = select(func.count()).select_from(Message).where(
            Message.conversation_id == conversation_id
        )
        if role:
            query = query.where(Message.role == role)

        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def get_total_tokens(
        db: AsyncSession,
        conversation_id: str
    ) -> Dict[str, int]:
        """Get total tokens used in a conversation."""
        from sqlalchemy import func

        query = select(
            func.coalesce(func.sum(Message.tokens_input), 0).label('input'),
            func.coalesce(func.sum(Message.tokens_output), 0).label('output')
        ).where(Message.conversation_id == conversation_id)

        result = await db.execute(query)
        row = result.one()
        return {
            "input": row.input,
            "output": row.output,
            "total": row.input + row.output
        }

    @staticmethod
    async def delete(db: AsyncSession, message_id: str) -> bool:
        """Delete a message."""
        message = await MessageRepository.get_by_id(db, message_id)
        if message:
            await db.delete(message)
            await db.flush()
            logger.debug(f"Deleted message: {message_id}")
            return True
        return False

    @staticmethod
    async def delete_by_conversation(
        db: AsyncSession,
        conversation_id: str
    ) -> int:
        """Delete all messages in a conversation. Returns count deleted."""
        from sqlalchemy import delete

        result = await db.execute(
            delete(Message).where(Message.conversation_id == conversation_id)
        )
        await db.flush()
        count = result.rowcount
        logger.info(f"Deleted {count} messages from conversation: {conversation_id}")
        return count

    @staticmethod
    async def to_langchain_messages(
        db: AsyncSession,
        conversation_id: str,
        max_messages: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Convert conversation messages to LangChain format.

        Returns a list of dictionaries suitable for LangChain message construction.
        """
        messages = await MessageRepository.get_by_conversation(
            db, conversation_id, limit=max_messages
        )
        return [msg.to_langchain_format() for msg in messages]
