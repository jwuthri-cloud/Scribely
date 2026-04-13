"""Pydantic validation for rules API request bodies — cheap guardrails."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.v1.rules import RuleCreateRequest, RuleStepIn, RuleUpdateRequest


def test_rule_step_accepts_llm_prompt():
    s = RuleStepIn(name="Summarize", order_index=0, step_type="llm_prompt", config={"model": "openai/gpt-5.4-mini"})
    assert s.step_type == "llm_prompt"


def test_rule_step_rejects_unknown_step_type():
    with pytest.raises(ValidationError, match="step_type"):
        RuleStepIn(name="x", order_index=0, step_type="not_a_real_type", config={})


def test_rule_create_rejects_bad_trigger():
    with pytest.raises(ValidationError, match="trigger"):
        RuleCreateRequest(name="R", trigger="whenever")


def test_rule_update_accepts_partial_trigger():
    u = RuleUpdateRequest(trigger="before_meeting")
    assert u.trigger == "before_meeting"
