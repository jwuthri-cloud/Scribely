"""
User-defined meeting automation rules — CRUD, test run, prompt optimizer stream.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_with_db
from app.database.models.rule import RuleTriggerEnum, RuleStepTypeEnum
from app.database.models.user import User
from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.rule import RuleRepository
from app.database.session import get_async_db_session
from app.model_name import ALLOWED_OPENROUTER_MODEL_IDS, DEFAULT_TRAINING
from app.services.rule_engine import execute_rule, stream_prompt_optimize
from app.utils.logging import get_logger

logger = get_logger("rules_api")

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class RuleStepIn(BaseModel):
    order_index: int = 0
    name: str = Field(..., min_length=1, max_length=255)
    step_type: str
    config: dict[str, Any] = Field(default_factory=dict)

    @field_validator("step_type")
    @classmethod
    def validate_step_type(cls, v: str) -> str:
        allowed = {e.value for e in RuleStepTypeEnum}
        if v not in allowed:
            raise ValueError(f"step_type must be one of {sorted(allowed)}")
        return v


class RuleStepOut(BaseModel):
    id: str
    order_index: int
    name: str
    step_type: str
    config: dict[str, Any]

    model_config = {"from_attributes": False}


class RuleOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    trigger: str
    enabled: bool
    steps: list[RuleStepOut]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = {"from_attributes": False}


class RuleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    trigger: str = RuleTriggerEnum.AFTER_MEETING.value
    enabled: bool = True
    steps: list[RuleStepIn] = Field(default_factory=list)

    @field_validator("trigger")
    @classmethod
    def validate_trigger(cls, v: str) -> str:
        allowed = {e.value for e in RuleTriggerEnum}
        if v not in allowed:
            raise ValueError(f"trigger must be one of {sorted(allowed)}")
        return v


class RuleUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    trigger: Optional[str] = None
    enabled: Optional[bool] = None
    steps: Optional[list[RuleStepIn]] = None

    @field_validator("trigger")
    @classmethod
    def validate_trigger(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {e.value for e in RuleTriggerEnum}
        if v not in allowed:
            raise ValueError(f"trigger must be one of {sorted(allowed)}")
        return v


class RuleExecutionOut(BaseModel):
    id: str
    rule_id: str
    meeting_id: str
    trigger: str
    status: str
    started_at: Optional[str]
    completed_at: Optional[str]
    step_results: Optional[list[dict[str, Any]]]
    error: Optional[str]


class TestRuleRequest(BaseModel):
    meeting_id: str = Field(..., min_length=1)


class PromptOptimizeRequest(BaseModel):
    message: str = Field(..., min_length=1)
    current_prompt: Optional[str] = None
    model: str = Field(default=DEFAULT_TRAINING)

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        if v not in ALLOWED_OPENROUTER_MODEL_IDS:
            raise ValueError(f"Unsupported model {v!r}.")
        return v


def _rule_to_out(rule) -> RuleOut:
    steps = sorted(rule.steps or [], key=lambda s: s.order_index)
    return RuleOut(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        trigger=str(rule.trigger),
        enabled=bool(rule.enabled),
        steps=[
            RuleStepOut(
                id=s.id,
                order_index=s.order_index,
                name=s.name,
                step_type=str(s.step_type),
                config=s.config if isinstance(s.config, dict) else {},
            )
            for s in steps
        ],
        created_at=rule.created_at.isoformat() if rule.created_at else None,
        updated_at=rule.updated_at.isoformat() if rule.updated_at else None,
    )


def _steps_payload(steps: list[RuleStepIn]) -> list[dict[str, Any]]:
    return [
        {
            "order_index": s.order_index,
            "name": s.name,
            "step_type": s.step_type,
            "config": s.config,
        }
        for s in steps
    ]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[RuleOut])
async def list_rules(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> list[RuleOut]:
    rows = await RuleRepository.list_for_user(db, user.id)
    return [_rule_to_out(r) for r in rows]


@router.post("/prompt/optimize/stream")
async def prompt_optimize_stream(
    body: PromptOptimizeRequest,
    _user: User = Depends(get_current_user_with_db),
):
    """Stream improved prompt text (SSE: `data: ...\\n\\n`)."""

    async def gen():
        try:
            async for chunk in stream_prompt_optimize(
                user_message=body.message,
                current_prompt=body.current_prompt,
                model=body.model,
            ):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("prompt_optimize_stream failed")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: RuleCreateRequest,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> RuleOut:
    rule = await RuleRepository.create_rule(
        db,
        user.id,
        body.name,
        description=body.description,
        trigger=body.trigger,
        enabled=body.enabled,
        steps=_steps_payload(body.steps) if body.steps else None,
    )
    await db.commit()
    loaded = await RuleRepository.get_by_id(db, rule.id, user_id=user.id)
    if not loaded:
        raise HTTPException(status_code=500, detail="Failed to load created rule")
    return _rule_to_out(loaded)


@router.get("/{rule_id}", response_model=RuleOut)
async def get_rule(
    rule_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> RuleOut:
    rule = await RuleRepository.get_by_id(db, rule_id, user_id=user.id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _rule_to_out(rule)


@router.patch("/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: str,
    body: RuleUpdateRequest,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> RuleOut:
    rule = await RuleRepository.get_by_id(db, rule_id, user_id=user.id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await RuleRepository.update_rule(
        db,
        rule,
        name=body.name,
        description=body.description,
        trigger=body.trigger,
        enabled=body.enabled,
        steps=_steps_payload(body.steps) if body.steps is not None else None,
    )
    await db.commit()
    loaded = await RuleRepository.get_by_id(db, rule_id, user_id=user.id)
    if not loaded:
        raise HTTPException(status_code=500, detail="Failed to load rule")
    return _rule_to_out(loaded)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> None:
    rule = await RuleRepository.get_by_id(db, rule_id, user_id=user.id, load_steps=False)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await RuleRepository.delete_rule(db, rule)
    await db.commit()


@router.post("/{rule_id}/test", response_model=dict)
async def test_rule(
    rule_id: str,
    body: TestRuleRequest,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> dict[str, Any]:
    """Execute the rule once against a meeting owned by the user."""
    rule = await RuleRepository.get_by_id(db, rule_id, user_id=user.id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    meeting = await MeetingRepository.get_by_id(db, body.meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    trig = rule.trigger
    final = await execute_rule(db, rule, meeting, trigger=str(trig))
    return {"status": final.value, "ok": final.value == "completed"}


@router.get("/{rule_id}/executions", response_model=list[RuleExecutionOut])
async def list_rule_executions(
    rule_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> list[RuleExecutionOut]:
    rule = await RuleRepository.get_by_id(db, rule_id, user_id=user.id, load_steps=False)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rows = await RuleRepository.list_executions_for_rule(db, rule_id, user.id)
    return [
        RuleExecutionOut(
            id=e.id,
            rule_id=e.rule_id,
            meeting_id=e.meeting_id,
            trigger=str(e.trigger),
            status=str(e.status),
            started_at=e.started_at.isoformat() if e.started_at else None,
            completed_at=e.completed_at.isoformat() if e.completed_at else None,
            step_results=e.step_results if isinstance(e.step_results, list) else None,
            error=e.error,
        )
        for e in rows
    ]

