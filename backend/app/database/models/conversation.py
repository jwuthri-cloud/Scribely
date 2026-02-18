"""
Conversation model for Scribely.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..base import Base

if TYPE_CHECKING:
    from .message import Message
    from .user import User


class ConversationStatusEnum(str, enum.Enum):
    """Conversation status."""
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Conversation(Base):
    """
    Conversation model for chat sessions.

    A conversation belongs to a user and contains multiple messages.
    It can be associated with a specific agent type.
    """
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # Conversation metadata
    title = Column(String(255), nullable=True)  # Auto-generated from first message
    agent_type = Column(String(100), nullable=True)  # Which agent handles this (e.g., "customer_support")
    model_name = Column(String(100), nullable=True)  # Default model for this conversation

    # Status
    status = Column(SQLEnum(ConversationStatusEnum), default=ConversationStatusEnum.ACTIVE, index=True)

    # Summary for long conversations (can be used for context compression)
    summary = Column(Text, nullable=True)

    # Flexible metadata for custom fields
    metadata = Column(JSON, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_message_at = Column(DateTime, nullable=True)  # For sorting by activity

    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at"
    )

    def __repr__(self):
        return f"<Conversation(id={self.id}, user_id={self.user_id}, agent_type={self.agent_type}, status={self.status})>"

    @property
    def message_count(self) -> int:
        """Get the number of messages in this conversation."""
        return len(self.messages) if self.messages else 0
