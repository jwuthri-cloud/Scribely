"""
Repository for meeting automation rules.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.rule import (
    Rule,
    RuleExecution,
    RuleExecutionStatusEnum,
    RuleStep,
    RuleTriggerEnum,
)

def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


_MISSING_FLOW = object()


class RuleRepository:
    """CRUD and queries for Rule, RuleStep, RuleExecution."""

    @staticmethod
    async def _upsert_steps(
        db: AsyncSession,
        rule_id: str,
        steps: list[dict[str, Any]],
    ) -> None:
        """Sync rule_steps to payload: update by id, insert new, delete missing."""
        if not steps:
            await db.execute(delete(RuleStep).where(RuleStep.rule_id == rule_id))
            await db.flush()
            return

        stmt = select(RuleStep).where(RuleStep.rule_id == rule_id)
        res = await db.execute(stmt)
        existing_rows = {r.id: r for r in res.scalars().all()}
        kept_ids: list[str] = []

        for i, s in enumerate(steps):
            raw_id = s.get("id")
            sid = str(raw_id).strip() if raw_id else ""
            stype = s.get("step_type") or s.get("type")
            name = s.get("name") or f"Step {i + 1}"
            cfg = s.get("config") if isinstance(s.get("config"), dict) else {}
            oi = int(s.get("order_index", i))

            if sid and sid in existing_rows:
                row = existing_rows[sid]
                row.order_index = oi
                row.name = name
                row.step_type = stype
                row.config = cfg
                kept_ids.append(sid)
            elif sid:
                db.add(
                    RuleStep(
                        id=sid,
                        rule_id=rule_id,
                        order_index=oi,
                        name=name,
                        step_type=stype,
                        config=cfg,
                    )
                )
                kept_ids.append(sid)
            else:
                nid = str(uuid.uuid4())
                db.add(
                    RuleStep(
                        id=nid,
                        rule_id=rule_id,
                        order_index=oi,
                        name=name,
                        step_type=stype,
                        config=cfg,
                    )
                )
                kept_ids.append(nid)

        await db.flush()
        to_remove = set(existing_rows.keys()) - set(kept_ids)
        if to_remove:
            await db.execute(delete(RuleStep).where(RuleStep.id.in_(to_remove)))
        await db.flush()

    @staticmethod
    async def create_rule(
        db: AsyncSession,
        user_id: str,
        name: str,
        *,
        description: Optional[str] = None,
        trigger: RuleTriggerEnum | str = RuleTriggerEnum.AFTER_MEETING,
        enabled: bool = True,
        steps: Optional[list[dict[str, Any]]] = None,
        flow_layout: Optional[dict[str, Any]] = None,
    ) -> Rule:
        rid = str(uuid.uuid4())
        tr = trigger.value if isinstance(trigger, RuleTriggerEnum) else str(trigger)
        rule = Rule(
            id=rid,
            user_id=user_id,
            name=name,
            description=description,
            trigger=tr,
            enabled=enabled,
            flow_layout=flow_layout,
        )
        db.add(rule)
        await db.flush()
        if steps:
            await RuleRepository._upsert_steps(db, rid, steps)
        await db.flush()
        await db.refresh(rule)
        return rule

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        rule_id: str,
        user_id: Optional[str] = None,
        *,
        load_steps: bool = True,
    ) -> Optional[Rule]:
        stmt = select(Rule).where(Rule.id == rule_id)
        if user_id:
            stmt = stmt.where(Rule.user_id == user_id)
        if load_steps:
            stmt = stmt.options(selectinload(Rule.steps))
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def list_for_user(
        db: AsyncSession,
        user_id: str,
        *,
        trigger: Optional[RuleTriggerEnum | str] = None,
        enabled_only: bool = False,
    ) -> list[Rule]:
        stmt = (
            select(Rule)
            .where(Rule.user_id == user_id)
            .options(selectinload(Rule.steps))
            .order_by(Rule.updated_at.desc())
        )
        if trigger is not None:
            tv = trigger.value if isinstance(trigger, RuleTriggerEnum) else str(trigger)
            stmt = stmt.where(Rule.trigger == tv)
        if enabled_only:
            stmt = stmt.where(Rule.enabled.is_(True))
        res = await db.execute(stmt)
        return list(res.scalars().unique().all())

    @staticmethod
    async def list_enabled_by_trigger(
        db: AsyncSession,
        user_id: str,
        trigger: RuleTriggerEnum | str,
    ) -> list[Rule]:
        tv = trigger.value if isinstance(trigger, RuleTriggerEnum) else str(trigger)
        stmt = (
            select(Rule)
            .where(Rule.user_id == user_id, Rule.trigger == tv, Rule.enabled.is_(True))
            .options(selectinload(Rule.steps))
            .order_by(Rule.created_at.asc())
        )
        res = await db.execute(stmt)
        return list(res.scalars().unique().all())

    @staticmethod
    async def update_rule(
        db: AsyncSession,
        rule: Rule,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        trigger: Optional[RuleTriggerEnum | str] = None,
        enabled: Optional[bool] = None,
        steps: Optional[list[dict[str, Any]]] = None,
        flow_layout: Any = _MISSING_FLOW,
    ) -> Rule:
        if name is not None:
            rule.name = name
        if description is not None:
            rule.description = description
        if trigger is not None:
            rule.trigger = trigger.value if isinstance(trigger, RuleTriggerEnum) else str(trigger)
        if enabled is not None:
            rule.enabled = enabled
        if flow_layout is not _MISSING_FLOW:
            rule.flow_layout = flow_layout
        rule.updated_at = _utc_naive()
        if steps is not None:
            await RuleRepository._upsert_steps(db, rule.id, steps)
        await db.flush()
        await db.refresh(rule)
        return rule

    @staticmethod
    async def delete_rule(db: AsyncSession, rule: Rule) -> None:
        await db.delete(rule)
        await db.flush()

    @staticmethod
    async def create_execution(
        db: AsyncSession,
        rule_id: str,
        meeting_id: str,
        trigger: str,
        status: RuleExecutionStatusEnum = RuleExecutionStatusEnum.PENDING,
    ) -> RuleExecution:
        ex = RuleExecution(
            id=str(uuid.uuid4()),
            rule_id=rule_id,
            meeting_id=meeting_id,
            trigger=trigger,
            status=status.value if isinstance(status, RuleExecutionStatusEnum) else str(status),
            started_at=_utc_naive(),
        )
        db.add(ex)
        await db.flush()
        await db.refresh(ex)
        return ex

    @staticmethod
    async def update_execution(
        db: AsyncSession,
        execution: RuleExecution,
        *,
        status: RuleExecutionStatusEnum | str,
        step_results: Optional[list[dict[str, Any]]] = None,
        error: Optional[str] = None,
    ) -> RuleExecution:
        execution.status = status.value if isinstance(status, RuleExecutionStatusEnum) else str(status)
        if step_results is not None:
            execution.step_results = step_results
        if error is not None:
            execution.error = error
        execution.completed_at = _utc_naive()
        await db.flush()
        await db.refresh(execution)
        return execution

    @staticmethod
    async def list_executions_for_rule(
        db: AsyncSession,
        rule_id: str,
        user_id: str,
        *,
        limit: int = 50,
    ) -> list[RuleExecution]:
        stmt = (
            select(RuleExecution)
            .join(Rule, RuleExecution.rule_id == Rule.id)
            .where(RuleExecution.rule_id == rule_id, Rule.user_id == user_id)
            .order_by(RuleExecution.started_at.desc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def list_executions_for_meeting(
        db: AsyncSession,
        meeting_id: str,
        user_id: str,
        *,
        limit: int = 100,
    ) -> list[tuple[RuleExecution, str]]:
        """Return (execution, rule_name) rows for a meeting, scoped to the rule owner."""
        stmt = (
            select(RuleExecution, Rule.name)
            .join(Rule, RuleExecution.rule_id == Rule.id)
            .where(
                RuleExecution.meeting_id == meeting_id,
                Rule.user_id == user_id,
            )
            .order_by(RuleExecution.started_at.desc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        return list(res.all())
