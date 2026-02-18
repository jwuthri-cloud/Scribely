"""
Message model for Scribely.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..base import Base

if TYPE_CHECKING:
    from .conversation import Conversation


class MessageRoleEnum(str, enum.Enum):
    """Message role in the conversation."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class Message(Base):
    """
    Message model for individual messages in a conversation.

    Supports various message types including user messages, assistant responses,
    system prompts, and tool call results.
    """
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False, index=True)

    # Message content
    role = Column(SQLEnum(MessageRoleEnum), nullable=False, index=True)
    content = Column(Text, nullable=False)

    # For assistant messages - which model generated this
    model = Column(String(100), nullable=True)

    # Tool calls (for assistant messages that invoke tools)
    tool_calls = Column(JSON, nullable=True)  # List of tool invocations

    # For tool messages - which tool call this is responding to
    tool_call_id = Column(String(100), nullable=True)
    tool_name = Column(String(100), nullable=True)

    # Metrics for assistant messages
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)

    # Structured output (if the message contains structured data)
    structured_output = Column(JSON, nullable=True)

    # Flexible metadata
    metadata = Column(JSON, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

    def __repr__(self):
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<Message(id={self.id}, role={self.role}, content='{content_preview}')>"

    def to_langchain_format(self) -> Dict[str, Any]:
        """
        Convert message to LangChain message format.

        Returns:
            Dictionary suitable for LangChain message construction.
        """
        base = {
            "role": self.role.value,
            "content": self.content,
        }

        if self.tool_calls:
            base["tool_calls"] = self.tool_calls

        if self.tool_call_id:
            base["tool_call_id"] = self.tool_call_id

        return base

    @classmethod
    def from_langchain_message(
        cls,
        message: Any,
        conversation_id: str,
        model: Optional[str] = None,
        latency_ms: Optional[int] = None
    ) -> "Message":
        """
        Create a Message from a LangChain message object.

        Args:
            message: LangChain message (HumanMessage, AIMessage, etc.)
            conversation_id: ID of the conversation this belongs to
            model: Model name that generated the message (for AI messages)
            latency_ms: Response latency in milliseconds

        Returns:
            Message instance
        """
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

        # Determine role based on message type
        if isinstance(message, HumanMessage):
            role = MessageRoleEnum.USER
        elif isinstance(message, AIMessage):
            role = MessageRoleEnum.ASSISTANT
        elif isinstance(message, SystemMessage):
            role = MessageRoleEnum.SYSTEM
        elif isinstance(message, ToolMessage):
            role = MessageRoleEnum.TOOL
        else:
            role = MessageRoleEnum.ASSISTANT  # Default fallback

        # Extract content
        content = message.content if isinstance(message.content, str) else str(message.content)

        # Extract tool calls if present
        tool_calls = None
        if hasattr(message, "tool_calls") and message.tool_calls:
            tool_calls = [
                {
                    "id": tc.get("id"),
                    "name": tc.get("name"),
                    "args": tc.get("args", {})
                }
                for tc in message.tool_calls
            ]

        # Extract tool_call_id for tool messages
        tool_call_id = getattr(message, "tool_call_id", None)
        tool_name = getattr(message, "name", None)

        return cls(
            conversation_id=conversation_id,
            role=role,
            content=content,
            model=model if role == MessageRoleEnum.ASSISTANT else None,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            latency_ms=latency_ms
        )
