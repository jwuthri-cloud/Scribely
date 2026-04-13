"""
User-defined meeting automation rules (sequential steps, lifecycle triggers).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy import JSON
from sqlalchemy.orm import relationship

from ..base import Base
from ..types import VarcharEnum


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RuleTriggerEnum(str, enum.Enum):
    BEFORE_MEETING = "before_meeting"
    AFTER_MEETING = "after_meeting"
    DURING_MEETING = "during_meeting"


class RuleStepTypeEnum(str, enum.Enum):
    LLM_PROMPT = "llm_prompt"
    SEND_EMAIL = "send_email"
    PUSH_NOTIFICATION = "push_notification"
    WEBHOOK = "webhook"
    COMPOSIO_ACTION = "composio_action"


class RuleExecutionStatusEnum(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Rule(Base):
    """A named rule owned by a user; runs when its trigger fires."""

    __tablename__ = "rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    trigger = Column(
        VarcharEnum(32),
        default=RuleTriggerEnum.AFTER_MEETING,
        nullable=False,
    )
    enabled = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=_utc_naive, nullable=False)
    updated_at = Column(DateTime, default=_utc_naive, onupdate=_utc_naive, nullable=False)

    user = relationship("User", backref="rules")
    steps = relationship(
        "RuleStep",
        back_populates="rule",
        order_by="RuleStep.order_index",
        cascade="all, delete-orphan",
    )
    executions = relationship("RuleExecution", back_populates="rule", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_rules_user_trigger", "user_id", "trigger"),)

    def __repr__(self) -> str:
        return f"<Rule(id={self.id}, name={self.name}, trigger={self.trigger})>"


class RuleStep(Base):
    """One ordered step in a rule pipeline."""

    __tablename__ = "rule_steps"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, ForeignKey("rules.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)
    name = Column(String(255), nullable=False)
    step_type = Column(VarcharEnum(32), nullable=False)
    config = Column(JSON, nullable=False, default=dict)

    rule = relationship("Rule", back_populates="steps")

    __table_args__ = (Index("ix_rule_steps_rule_order", "rule_id", "order_index"),)

    def __repr__(self) -> str:
        return f"<RuleStep(id={self.id}, order={self.order_index}, type={self.step_type})>"


class RuleExecution(Base):
    """Audit log of a single rule run for a meeting."""

    __tablename__ = "rule_executions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, ForeignKey("rules.id", ondelete="CASCADE"), nullable=False, index=True)
    meeting_id = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    trigger = Column(VarcharEnum(32), nullable=False)
    status = Column(VarcharEnum(32), default=RuleExecutionStatusEnum.PENDING, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    step_results = Column(JSON, nullable=True)  # list of {step_id, name, ok, result, error}
    error = Column(Text, nullable=True)

    rule = relationship("Rule", back_populates="executions")
    meeting = relationship("Meeting", backref="rule_executions")

    __table_args__ = (Index("ix_rule_executions_meeting", "meeting_id", "started_at"),)

    def __repr__(self) -> str:
        return f"<RuleExecution(id={self.id}, rule_id={self.rule_id}, status={self.status})>"
