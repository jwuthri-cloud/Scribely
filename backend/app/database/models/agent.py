"""
Agent model for Scribely.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.model_name import DEFAULT_TRAINING

from ..base import Base

if TYPE_CHECKING:
    from .agent_run import AgentRun
    from .user import User


class Agent(Base):
    """
    Agent model for storing agent configurations.

    Agents are reusable configurations that define how an AI agent behaves,
    including its system prompt, tools, model settings, and response format.
    """
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Basic info
    name = Column(String(100), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)  # URL-friendly identifier
    description = Column(Text, nullable=True)
    agent_type = Column(String(50), nullable=False, index=True)  # customer_support, coding_assistant, etc.

    # Agent configuration
    system_prompt = Column(Text, nullable=True)
    model_name = Column(String(100), default=DEFAULT_TRAINING)
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, nullable=True)  # Max output tokens

    # Tools configuration
    tools = Column(JSON, default=list)  # List of tool names this agent can use
    tool_choice = Column(String(50), default="auto")  # "auto", "required", "none", or specific tool name

    # Structured output schema (Pydantic model as JSON schema)
    response_schema = Column(JSON, nullable=True)
    response_schema_name = Column(String(100), nullable=True)  # Name of the Pydantic model

    # Fallback configuration
    fallback_models = Column(JSON, default=list)  # List of fallback model names

    # Status and versioning
    is_active = Column(Boolean, default=True, index=True)
    is_public = Column(Boolean, default=False)  # Can be used by other users
    version = Column(Integer, default=1)

    # Metadata
    tags = Column(JSON, default=list)  # For categorization
    metadata = Column(JSON, default=dict)  # Custom fields

    # Timestamps and ownership
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)

    # Relationships
    creator = relationship("User", back_populates="agents")
    runs = relationship("AgentRun", back_populates="agent", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Agent(id={self.id}, name={self.name}, type={self.agent_type}, active={self.is_active})>"

    def to_config_dict(self) -> Dict[str, Any]:
        """
        Convert agent to configuration dictionary for runtime use.

        Returns:
            Dictionary with all configuration needed to instantiate the agent.
        """
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "agent_type": self.agent_type,
            "system_prompt": self.system_prompt,
            "model_name": self.model_name,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "tools": self.tools,
            "tool_choice": self.tool_choice,
            "response_schema": self.response_schema,
            "response_schema_name": self.response_schema_name,
            "fallback_models": self.fallback_models,
            "metadata": self.metadata,
        }

    @classmethod
    def create_slug(cls, name: str) -> str:
        """Generate a URL-friendly slug from the agent name."""
        import re
        # Convert to lowercase, replace spaces and special chars with hyphens
        slug = name.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug
