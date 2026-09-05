"""
Execute user-defined meeting rules (sequential steps with Jinja2 templates).

Triggers: before_meeting, after_meeting, during_meeting (during is reserved for future desktop hooks).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, AsyncGenerator, Optional, Union

import aiofiles
import httpx
from jinja2.sandbox import SandboxedEnvironment
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database.models.calendar import CalendarEvent
from app.database.models.meeting import Meeting
from app.database.models.meeting_processing import MeetingProcessing
from app.database.models.rule import (
    Rule,
    RuleExecutionStatusEnum,
    RuleStep,
    RuleStepTypeEnum,
    RuleTriggerEnum,
)
from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.push import PushRepository
from app.database.repositories.rule import RuleRepository
from app.infrastructure.langfuse_handler import get_langfuse_callbacks
from app.infrastructure.llm_provider import OpenRouterProvider
from app.infrastructure.object_storage import (
    is_object_storage_configured,
    mirror_meeting_from_object_storage_async,
)
from app.model_name import DEFAULT_TRAINING
from app.services.rule_flow import ancestor_step_ids_sorted, ordered_steps_from_flow
from app.services.webpush_sender import _send_one_sync
from app.utils.logging import get_logger

logger = get_logger("rule_engine")

_jinja_env = SandboxedEnvironment(autoescape=False)


def _render_template_str(template_str: str, context: dict[str, Any]) -> str:
    return _jinja_env.from_string(template_str).render(**context)


def _render_json_leaves(obj: Any, context: dict[str, Any]) -> Any:
    """Recursively render string leaves as Jinja templates."""
    if isinstance(obj, str):
        return _render_template_str(obj, context)
    if isinstance(obj, list):
        return [_render_json_leaves(x, context) for x in obj]
    if isinstance(obj, dict):
        return {k: _render_json_leaves(v, context) for k, v in obj.items()}
    return obj


async def _ensure_meeting_dir(meeting: Meeting) -> Optional[Path]:
    """Return local meeting dir with transcript.json, mirroring from object storage if needed."""
    settings = get_settings()
    meeting_dir = Path(settings.upload_dir) / meeting.storage_path
    if is_object_storage_configured() and (
        not meeting_dir.is_dir() or not (meeting_dir / "transcript.json").exists()
    ):
        await mirror_meeting_from_object_storage_async(
            meeting_dir, meeting.storage_path
        )
    if not meeting_dir.is_dir() or not (meeting_dir / "transcript.json").exists():
        return None
    return meeting_dir


def _transcript_json_to_text(data: Any) -> str:
    if isinstance(data, list):
        lines: list[str] = []
        for row in data:
            if isinstance(row, dict):
                t = row.get("text") or row.get("content") or ""
                sp = row.get("speaker") or row.get("label") or ""
                if sp:
                    lines.append(f"{sp}: {t}")
                else:
                    lines.append(str(t))
            else:
                lines.append(str(row))
        return "\n".join(lines)
    if isinstance(data, dict):
        entries = data.get("entries") or data.get("lines")
        if isinstance(entries, list):
            return _transcript_json_to_text(entries)
        return json.dumps(data, ensure_ascii=False)[:50000]
    return str(data)[:50000]


async def _read_json_file(path: Path) -> Any:
    async with aiofiles.open(path, "r", encoding="utf-8") as f:
        raw = await f.read()
    return json.loads(raw)


async def _load_transcript_bundle(meeting_dir: Path) -> tuple[str, Optional[Any]]:
    enriched = meeting_dir / "transcript_enriched.json"
    original = meeting_dir / "transcript.json"
    path = enriched if enriched.exists() else original
    try:
        data = await _read_json_file(path)
    except Exception as e:
        logger.warning("Failed to read transcript %s: %s", path, e)
        return "", None
    return _transcript_json_to_text(data), data


async def _load_calendar_participants(
    db: AsyncSession, meeting: Meeting
) -> list[dict[str, Any]]:
    if not meeting.calendar_event_id:
        return []
    stmt = (
        select(CalendarEvent)
        .where(CalendarEvent.id == meeting.calendar_event_id)
        .options(selectinload(CalendarEvent.participants))
    )
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        return []
    out: list[dict[str, Any]] = []
    for p in ev.participants or []:
        out.append(
            {
                "email": getattr(p, "email", None),
                "name": getattr(p, "display_name", None),
                "response_status": getattr(p, "response_status", None),
            }
        )
    return out


async def build_rule_context(db: AsyncSession, meeting: Meeting) -> dict[str, Any]:
    """Template context for Jinja: meeting.*, participants, steps (list of step outputs)."""
    meeting_dir = await _ensure_meeting_dir(meeting)
    transcript_text = ""
    metadata_text = ""
    stmt = select(MeetingProcessing).where(MeetingProcessing.meeting_id == meeting.id)
    pr = await db.execute(stmt)
    proc = pr.scalar_one_or_none()
    if proc and isinstance(proc.result_summary, dict):
        metadata_text = json.dumps(proc.result_summary, ensure_ascii=False)

    if meeting_dir:
        transcript_text, _ = await _load_transcript_bundle(meeting_dir)

    participants = await _load_calendar_participants(db, meeting)

    meeting_ctx = {
        "id": meeting.id,
        "title": meeting.title or "",
        "duration_seconds": meeting.duration_seconds,
        "entry_count": meeting.entry_count,
        "transcript": transcript_text,
        "metadata": metadata_text,
        "status": str(meeting.status),
        "recorded_at": meeting.recorded_at.isoformat() if meeting.recorded_at else "",
        "calendar_event_id": meeting.calendar_event_id or "",
    }

    return {
        "meeting": meeting_ctx,
        "participants": participants,
        "steps": [],
    }


def _flatten_context_for_jinja(ctx: dict[str, Any]) -> dict[str, Any]:
    """Expose `steps` as steps.0.result-style access via numeric keys in a list (already list)."""
    return ctx


async def _step_llm_prompt(
    config: dict[str, Any],
    context: dict[str, Any],
    *,
    user_id: str,
    meeting_id: str,
    rule_id: str,
) -> Union[str, dict[str, Any]]:
    model = config.get("model") or DEFAULT_TRAINING
    system_prompt = config.get("system_prompt") or "You are a helpful assistant."
    user_tmpl = config.get("user_prompt_template") or "{{ meeting.transcript }}"
    flat = _flatten_context_for_jinja(context)
    user_msg = _render_template_str(user_tmpl, flat)
    sys_msg = _render_template_str(str(system_prompt), flat)

    provider = OpenRouterProvider()
    llm = provider.get_llm(
        model_name=model,
        temperature=float(config.get("temperature", 0.2)),
        enable_langfuse=True,
    )
    callbacks = get_langfuse_callbacks()
    invoke_cfg: dict[str, Any] = {
        "metadata": {
            "rule_id": rule_id,
            "meeting_id": meeting_id,
            "user_id": user_id,
            "kind": "rule_llm_prompt",
        }
    }
    if callbacks:
        invoke_cfg["callbacks"] = callbacks

    messages = [SystemMessage(content=sys_msg), HumanMessage(content=user_msg)]

    # ── Structured output branch ─────────────────────────────────────────
    output_schema = config.get("output_schema")
    if output_schema and isinstance(output_schema, list) and len(output_schema) > 0:
        from pydantic import create_model  # local import to keep cold-start fast

        TYPE_MAP: dict[str, type] = {
            "string": str,
            "number": float,
            "boolean": bool,
            "array": list,
        }
        field_defs: dict[str, Any] = {}
        for f in output_schema:
            if not isinstance(f, dict) or not f.get("name"):
                continue
            python_type = TYPE_MAP.get(f.get("type", "string"), str)
            field_defs[f["name"]] = (python_type, ...)

        if field_defs:
            DynModel = create_model("StepOutput", **field_defs)
            structured_llm = llm.with_structured_output(DynModel)
            result = await structured_llm.ainvoke(messages, config=invoke_cfg)
            if hasattr(result, "model_dump"):
                return result.model_dump()
            return dict(result) if isinstance(result, dict) else str(result)

    # ── Plain-text branch (default) ───────────────────────────────────────
    resp = await llm.ainvoke(messages, config=invoke_cfg)
    content = getattr(resp, "content", None)
    return content if isinstance(content, str) else str(content)


async def _step_send_email(
    config: dict[str, Any], context: dict[str, Any]
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.resend_api_key:
        raise RuntimeError("RESEND_API_KEY is not configured; cannot send email.")

    flat = _flatten_context_for_jinja(context)
    to_s = _render_template_str(config.get("to_template") or "", flat)
    subject = _render_template_str(
        config.get("subject_template") or "(no subject)", flat
    )
    body = _render_template_str(config.get("body_template") or "", flat)

    to_list = [x.strip() for x in to_s.split(",") if x.strip()]
    if not to_list:
        raise ValueError("Email step: rendered `to` is empty")

    payload: dict[str, Any] = {
        "from": settings.resend_from_email,
        "to": to_list,
        "subject": subject,
    }
    if config.get("body_is_html", True):
        payload["html"] = body
    else:
        payload["text"] = body

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        r.raise_for_status()
        return {"status": r.status_code, "body": r.json() if r.content else {}}


async def _step_push_notification(
    db: AsyncSession,
    user_id: str,
    config: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    flat = _flatten_context_for_jinja(context)
    title = _render_template_str(config.get("title_template") or "Scribely", flat)
    body = _render_template_str(config.get("body_template") or "", flat)
    payload = {
        "title": title,
        "body": body,
        "tag": "meeting-rule",
    }
    subs = await PushRepository.list_subscriptions_for_user(db, user_id)
    if not subs:
        return {"sent": 0, "message": "No push subscriptions for user"}

    sent = 0
    for sub in subs:
        code = await asyncio.to_thread(_send_one_sync, sub, payload)
        if code and code != 410:
            sent += 1
    return {"sent": sent, "total": len(subs)}


async def _step_webhook(
    config: dict[str, Any], context: dict[str, Any]
) -> dict[str, Any]:
    url = (config.get("url") or "").strip()
    if not url:
        raise ValueError("webhook step: url is required")
    method = (config.get("method") or "POST").upper()
    flat = _flatten_context_for_jinja(context)
    headers_raw = config.get("headers") or {}
    headers = (
        _render_json_leaves(headers_raw, flat) if isinstance(headers_raw, dict) else {}
    )
    body_tmpl = config.get("body_template")
    if body_tmpl is None:
        data = _render_json_leaves(config.get("body") or {}, flat)
        content = json.dumps(data, ensure_ascii=False)
        ctype = "application/json"
    else:
        if isinstance(body_tmpl, str):
            content = _render_template_str(body_tmpl, flat)
        else:
            content = json.dumps(
                _render_json_leaves(body_tmpl, flat), ensure_ascii=False
            )
        ctype = config.get("content_type") or "application/json"

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.request(
            method, url, headers={**headers, "Content-Type": ctype}, content=content
        )
        return {"status": r.status_code, "text": r.text[:8000]}


async def _step_composio_action(
    user_id: str,
    config: dict[str, Any],
    context: dict[str, Any],
) -> Any:
    settings = get_settings()
    if not settings.composio_api_key:
        raise RuntimeError("COMPOSIO_API_KEY is not configured")

    flat = _flatten_context_for_jinja(context)
    slug = _render_template_str(config.get("slug") or "", flat).strip()
    if not slug:
        raise ValueError("composio_action step: slug is required")

    args_tmpl = config.get("arguments") or config.get("params_template") or {}
    if isinstance(args_tmpl, str):
        rendered = _render_template_str(args_tmpl, flat)
        arguments = json.loads(rendered) if rendered.strip() else {}
    else:
        arguments = _render_json_leaves(args_tmpl, flat)
        if not isinstance(arguments, dict):
            raise ValueError("composio arguments must render to an object")

    from composio import Composio

    composio = Composio(api_key=settings.composio_api_key)
    resp = composio.tools.execute(slug=slug, arguments=arguments, user_id=user_id)
    if hasattr(resp, "model_dump"):
        return resp.model_dump()
    return {"result": str(resp)}


async def _run_step(
    db: AsyncSession,
    step: RuleStep,
    context: dict[str, Any],
    *,
    user_id: str,
    meeting_id: str,
    rule_id: str,
) -> tuple[Any, Optional[str]]:
    st = step.step_type
    cfg = step.config if isinstance(step.config, dict) else {}
    try:
        if st == RuleStepTypeEnum.LLM_PROMPT.value:
            out = await _step_llm_prompt(
                cfg, context, user_id=user_id, meeting_id=meeting_id, rule_id=rule_id
            )
        elif st == RuleStepTypeEnum.SEND_EMAIL.value:
            out = await _step_send_email(cfg, context)
        elif st == RuleStepTypeEnum.PUSH_NOTIFICATION.value:
            out = await _step_push_notification(db, user_id, cfg, context)
        elif st == RuleStepTypeEnum.WEBHOOK.value:
            out = await _step_webhook(cfg, context)
        elif st == RuleStepTypeEnum.COMPOSIO_ACTION.value:
            out = await _step_composio_action(user_id, cfg, context)
        else:
            raise ValueError(f"Unknown step_type: {st}")
        return out, None
    except Exception as e:
        logger.exception("Rule step failed: %s", step.id)
        return None, str(e)


async def execute_rule(
    db: AsyncSession,
    rule: Rule,
    meeting: Meeting,
    *,
    trigger: RuleTriggerEnum | str,
) -> RuleExecutionStatusEnum:
    """Run all steps sequentially; persist RuleExecution."""
    uid = meeting.user_id
    trig = trigger.value if isinstance(trigger, RuleTriggerEnum) else str(trigger)
    execution = await RuleRepository.create_execution(
        db, rule.id, meeting.id, trig, status=RuleExecutionStatusEnum.RUNNING
    )

    context = await build_rule_context(db, meeting)
    step_results: list[dict[str, Any]] = []

    ordered, flow_err = ordered_steps_from_flow(rule)
    if flow_err:
        await RuleRepository.update_execution(
            db,
            execution,
            status=RuleExecutionStatusEnum.FAILED,
            step_results=[],
            error=flow_err,
        )
        await db.commit()
        return RuleExecutionStatusEnum.FAILED

    order_ids = [s.id for s in ordered]
    edges_raw: list | None = None
    raw_layout = getattr(rule, "flow_layout", None)
    if isinstance(raw_layout, dict):
        er = raw_layout.get("edges")
        edges_raw = er if isinstance(er, list) else None

    results_by_id: dict[str, Any] = {}

    try:
        for step in ordered:
            ancestor_ids = ancestor_step_ids_sorted(step.id, edges_raw, order_ids)
            context["steps"] = [{"result": results_by_id[aid]} for aid in ancestor_ids]

            result, err = await _run_step(
                db,
                step,
                context,
                user_id=uid,
                meeting_id=meeting.id,
                rule_id=rule.id,
            )
            entry = {
                "step_id": step.id,
                "name": step.name,
                "step_type": step.step_type,
                "ok": err is None,
                "result": result,
                "error": err,
            }
            step_results.append(entry)
            if err:
                await RuleRepository.update_execution(
                    db,
                    execution,
                    status=RuleExecutionStatusEnum.FAILED,
                    step_results=step_results,
                    error=err,
                )
                await db.commit()
                return RuleExecutionStatusEnum.FAILED
            results_by_id[step.id] = result

        await RuleRepository.update_execution(
            db,
            execution,
            status=RuleExecutionStatusEnum.COMPLETED,
            step_results=step_results,
            error=None,
        )
        await db.commit()
        return RuleExecutionStatusEnum.COMPLETED
    except Exception as e:
        logger.exception("Rule execution crashed: %s", rule.id)
        await RuleRepository.update_execution(
            db,
            execution,
            status=RuleExecutionStatusEnum.FAILED,
            step_results=step_results,
            error=str(e),
        )
        await db.commit()
        return RuleExecutionStatusEnum.FAILED


async def execute_rules_for_meeting(
    meeting_id: str,
    trigger: RuleTriggerEnum | str,
) -> None:
    """Load meeting + enabled rules for user/trigger and execute each rule."""
    from app.database.session import get_async_session

    async with get_async_session() as db:
        meeting = await MeetingRepository.get_by_id(db, meeting_id)
        if not meeting:
            logger.warning(
                "execute_rules_for_meeting: meeting %s not found", meeting_id
            )
            return
        rules = await RuleRepository.list_enabled_by_trigger(
            db, meeting.user_id, trigger
        )
        if not rules:
            return
        for rule in rules:
            try:
                await execute_rule(db, rule, meeting, trigger=trigger)
            except Exception:
                logger.exception("execute_rules_for_meeting: rule %s failed", rule.id)


async def stream_prompt_optimize(
    *,
    user_message: str,
    current_prompt: Optional[str],
    model: str,
) -> AsyncGenerator[str, None]:
    """SSE-style token stream for the rule prompt optimizer (no DB)."""
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name=model, temperature=0.3, enable_langfuse=True)
    sys = (
        "You help users refine automation prompts for a meeting assistant product (Scribely). "
        "Available template variables in user prompts: meeting.title, meeting.recorded_at, "
        "meeting.transcript, meeting.metadata, meeting.duration_seconds, participants (list), "
        "steps[N].result for prior step outputs. "
        "Output only the improved prompt text unless asked for JSON."
    )
    human = f"Current prompt (optional):\n{current_prompt or '(none)'}\n\nUser request:\n{user_message}"
    cb = get_langfuse_callbacks()
    cfg: dict[str, Any] = {"metadata": {"kind": "rule_prompt_optimize"}}
    if cb:
        cfg["callbacks"] = cb

    stream = llm.astream(
        [SystemMessage(content=sys), HumanMessage(content=human)],
        config=cfg,
    )
    async for chunk in stream:
        c = getattr(chunk, "content", None)
        if isinstance(c, str) and c:
            yield c
