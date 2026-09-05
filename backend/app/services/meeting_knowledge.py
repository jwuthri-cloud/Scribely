"""Post-meeting deal detection and knowledge extraction.

Called from ``task_runner._finalize_success`` after processing a meeting.
Best-effort: failures here do NOT fail the meeting.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.agents.agents.knowledge_extractor import KnowledgeExtractorAgent
from app.database.models.calendar import CalendarEvent
from app.database.models.meeting import Meeting
from app.database.models.user import User
from app.database.repositories.contact import ContactRepository
from app.database.repositories.deal import DealRepository
from app.database.repositories.knowledge import ContactKnowledgeRepository
from app.database.session import get_async_session
from app.services.deal_detection import (
    detect_deal_domain,
    domain_to_deal_name,
    normalize_email,
)
from app.utils.logging import get_logger

logger = get_logger("meeting_knowledge")


def _load_transcript(meeting: Meeting) -> list[dict] | None:
    storage = meeting.storage_path
    if not storage:
        return None
    meeting_dir = Path(storage)
    for name in ("transcript_enriched.json", "transcript.json"):
        path = meeting_dir / name
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed reading {path}: {e}")
            continue
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("entries", "utterances", "segments"):
                val = data.get(key)
                if isinstance(val, list):
                    return val
    return None


def _participants_from_event(
    event: Optional[CalendarEvent], owner_email: Optional[str]
) -> list[dict]:
    if event is None:
        return []
    owner_lower = normalize_email(owner_email)
    out: list[dict] = []
    for p in event.participants or []:
        if not p.email or p.is_self:
            continue
        el = p.email.strip().lower()
        if owner_lower and el == owner_lower:
            continue
        out.append({"email": el, "full_name": p.display_name})
    return out


async def run_post_meeting_knowledge(meeting_id: str) -> None:
    """Re-detect deal + extract contact knowledge for a completed meeting.

    Runs in a fresh DB session. Safe to call as a fire-and-forget task;
    exceptions are swallowed with a log message.
    """
    try:
        async with get_async_session() as db:
            stmt = (
                select(Meeting)
                .where(Meeting.id == meeting_id)
                .options(
                    selectinload(Meeting.calendar_event).selectinload(
                        CalendarEvent.participants
                    ),
                )
            )
            result = await db.execute(stmt)
            meeting = result.scalar_one_or_none()
            if meeting is None:
                logger.warning(f"knowledge: meeting {meeting_id} not found")
                return

            user_result = await db.execute(
                select(User).where(User.id == meeting.user_id)
            )
            user = user_result.scalar_one_or_none()
            owner_email = (user.email or "").lower() if user and user.email else None

            participants = _participants_from_event(meeting.calendar_event, owner_email)
            if not participants:
                logger.info(
                    f"knowledge: no external participants for meeting {meeting_id}"
                )
                return

            emails = [p["email"] for p in participants]
            domain = detect_deal_domain(owner_email, emails)
            deal = None
            if domain:
                deal = await DealRepository.get_or_create(
                    db,
                    meeting.user_id,
                    domain,
                    default_name=domain_to_deal_name(domain),
                )
                if meeting.deal_id != deal.id:
                    meeting.deal_id = deal.id

            contact_by_email: dict[str, str] = {}
            for p in participants:
                contact = await ContactRepository.upsert(
                    db,
                    meeting.user_id,
                    p["email"],
                    full_name=p.get("full_name"),
                    deal_id=deal.id if deal else None,
                    touch_last_seen=True,
                )
                contact_by_email[p["email"]] = contact.id

            transcript = _load_transcript(meeting)
            if not transcript:
                logger.info(
                    f"knowledge: no transcript for meeting {meeting_id}, skipping extraction"
                )
                await db.commit()
                return

            try:
                agent = KnowledgeExtractorAgent()
                response = await agent.extract(
                    transcript=transcript,
                    owner_email=owner_email,
                    participants=participants,
                    session_id=meeting.session_id,
                    user_id=meeting.user_id,
                )
            except Exception as e:
                logger.error(f"knowledge: agent failed for meeting {meeting_id}: {e}")
                await db.commit()
                return

            entries = []
            for fact in response.facts:
                contact_id = contact_by_email.get(fact.email.lower())
                if not contact_id:
                    continue
                entries.append(
                    {
                        "contact_id": contact_id,
                        "fact": fact.fact,
                        "category": fact.category,
                        "confidence": fact.confidence,
                        "source_snippet": fact.source_snippet,
                    }
                )

            if entries:
                await ContactKnowledgeRepository.bulk_create(
                    db,
                    user_id=meeting.user_id,
                    meeting_id=meeting.id,
                    deal_id=deal.id if deal else None,
                    entries=entries,
                )
            else:
                logger.info(f"knowledge: no extractable facts for meeting {meeting_id}")

            await db.commit()
            logger.info(
                f"knowledge: meeting {meeting_id} processed "
                f"(deal={'set' if deal else 'none'}, facts={len(entries)})"
            )
    except Exception as e:
        logger.exception(f"knowledge: unhandled error for meeting {meeting_id}: {e}")
