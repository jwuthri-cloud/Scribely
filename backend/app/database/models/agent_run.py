"""
AgentRun model for AssistMe.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from ..base import Base

if TYPE_CHECKING:
    from .agent import Agent
    from .conversation import Conversation
    from .user import User


class AgentRunStatusEnum(str, enum.Enum):
    """Agent run execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class AgentRun(Base):
    """
    AgentRun model for tracking agent executions.

    Each run represents a single invocation of an agent with input/output tracking,
    metrics, and tracing information.
    """
    __tablename__ = "agent_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # References
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_run_id = Column(String, ForeignKey("agent_runs.id"), nullable=True, index=True)  # For nested runs

    # Execution status
    status = Column(SQLEnum(AgentRunStatusEnum), default=AgentRunStatusEnum.PENDING, index=True)

    # Input/Output
    input_data = Column(JSON, nullable=False)  # The input to the agent
    output_data = Column(JSON, nullable=True)  # The structured output
    error = Column(Text, nullable=True)  # Error message if failed
    error_type = Column(String(100), nullable=True)  # Exception class name

    # Model used (may differ from agent default due to fallbacks)
    model_used = Column(String(100), nullable=True)

    # Metrics
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    tool_calls_count = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)

    # Cost tracking (in USD cents to avoid floating point issues)
    cost_cents = Column(Integer, nullable=True)

    # Observability
    trace_id = Column(String(100), nullable=True, index=True)  # Langfuse trace ID
    span_id = Column(String(100), nullable=True)  # Langfuse span ID
    session_id = Column(String(100), nullable=True, index=True)  # Session for grouping

    # Tool execution details
    tool_calls = Column(JSON, nullable=True)  # Detailed tool call information

    # Flexible metadata
    metadata = Column(JSON, default=dict)
    tags = Column(JSON, default=list)  # For filtering runs

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    agent = relationship("Agent", back_populates="runs")
    conversation = relationship("Conversation")
    user = relationship("User", back_populates="agent_runs")
    parent_run = relationship("AgentRun", remote_side=[id], backref="child_runs")

    def __repr__(self):
        return f"<AgentRun(id={self.id}, agent_id={self.agent_id}, status={self.status})>"

    def mark_started(self) -> None:
        """Mark the run as started."""
        self.status = AgentRunStatusEnum.RUNNING
        self.started_at = datetime.utcnow()

    def mark_completed(
        self,
        output_data: Dict[str, Any],
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        latency_ms: Optional[int] = None,
        tool_calls_count: int = 0,
        model_used: Optional[str] = None,
        cost_cents: Optional[int] = None
    ) -> None:
        """Mark the run as completed with results."""
        self.status = AgentRunStatusEnum.COMPLETED
        self.completed_at = datetime.utcnow()
        self.output_data = output_data
        self.tokens_input = tokens_input
        self.tokens_output = tokens_output
        self.total_tokens = (tokens_input or 0) + (tokens_output or 0)
        self.latency_ms = latency_ms
        self.tool_calls_count = tool_calls_count
        self.model_used = model_used
        self.cost_cents = cost_cents

    def mark_failed(
        self,
        error: str,
        error_type: Optional[str] = None
    ) -> None:
        """Mark the run as failed with error details."""
        self.status = AgentRunStatusEnum.FAILED
        self.completed_at = datetime.utcnow()
        self.error = error
        self.error_type = error_type

    def mark_cancelled(self) -> None:
        """Mark the run as cancelled."""
        self.status = AgentRunStatusEnum.CANCELLED
        self.completed_at = datetime.utcnow()

    def mark_timeout(self) -> None:
        """Mark the run as timed out."""
        self.status = AgentRunStatusEnum.TIMEOUT
        self.completed_at = datetime.utcnow()
        self.error = "Execution timed out"
        self.error_type = "TimeoutError"

    @property
    def duration_ms(self) -> Optional[int]:
        """Calculate run duration in milliseconds."""
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            return int(delta.total_seconds() * 1000)
        return None

    @property
    def is_finished(self) -> bool:
        """Check if the run has finished (success, failure, or cancelled)."""
        return self.status in [
            AgentRunStatusEnum.COMPLETED,
            AgentRunStatusEnum.FAILED,
            AgentRunStatusEnum.CANCELLED,
            AgentRunStatusEnum.TIMEOUT
        ]
