"""Deals API."""

from __future__ import annotations

from app.api.deps import get_current_user_with_db
from app.database.models.contact import Contact
from app.database.models.knowledge import ContactKnowledge
from app.database.models.meeting import Meeting
from app.database.models.user import User
from app.database.repositories.deal import DealRepository
from app.database.session import get_async_db_session
from app.models.deal import (
    ContactSummaryOut,
    DealDetailOut,
    DealListResponse,
    DealSummaryOut,
    KnowledgeEntryOut,
    MeetingRefOut,
)
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("deals_api")
router = APIRouter()


@router.get("", response_model=DealListResponse)
async def list_deals(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> DealListResponse:
    rows = await DealRepository.list_for_user(db, user.id)
    deals = [
        DealSummaryOut(
            id=d.id,
            domain=d.domain,
            name=d.name,
            status=str(d.status),
            contact_count=cc,
            meeting_count=mc,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for (d, cc, mc) in rows
    ]
    return DealListResponse(deals=deals, total=len(deals))


@router.get("/{deal_id}", response_model=DealDetailOut)
async def get_deal(
    deal_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> DealDetailOut:
    deal = await DealRepository.get_by_id(db, deal_id, user_id=user.id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")

    contacts_res = await db.execute(
        select(Contact)
        .where(Contact.user_id == user.id, Contact.deal_id == deal_id)
        .order_by(Contact.last_seen_at.desc())
    )
    contacts = list(contacts_res.scalars().all())

    meetings_res = await db.execute(
        select(Meeting)
        .where(Meeting.user_id == user.id, Meeting.deal_id == deal_id)
        .order_by(Meeting.recorded_at.desc().nullslast(), Meeting.created_at.desc())
        .limit(50)
    )
    meetings = list(meetings_res.scalars().all())

    kn_res = await db.execute(
        select(ContactKnowledge)
        .where(ContactKnowledge.user_id == user.id, ContactKnowledge.deal_id == deal_id)
        .order_by(ContactKnowledge.created_at.desc())
        .limit(200)
    )
    knowledge_rows = list(kn_res.scalars().all())

    contact_by_id = {c.id: c for c in contacts}
    meeting_by_id = {m.id: m for m in meetings}

    knowledge = [
        KnowledgeEntryOut(
            id=k.id,
            contact_id=k.contact_id,
            contact_email=contact_by_id.get(k.contact_id).email if contact_by_id.get(k.contact_id) else None,
            contact_name=contact_by_id.get(k.contact_id).full_name if contact_by_id.get(k.contact_id) else None,
            deal_id=k.deal_id,
            meeting_id=k.meeting_id,
            meeting_title=meeting_by_id.get(k.meeting_id).title if meeting_by_id.get(k.meeting_id) else None,
            meeting_recorded_at=meeting_by_id.get(k.meeting_id).recorded_at if meeting_by_id.get(k.meeting_id) else None,
            fact=k.fact,
            category=str(k.category),
            confidence=k.confidence,
            source_snippet=k.source_snippet,
            created_at=k.created_at,
        )
        for k in knowledge_rows
    ]

    return DealDetailOut(
        id=deal.id,
        domain=deal.domain,
        name=deal.name,
        status=str(deal.status),
        created_at=deal.created_at,
        updated_at=deal.updated_at,
        contacts=[ContactSummaryOut.model_validate(c) for c in contacts],
        recent_meetings=[
            MeetingRefOut(
                id=m.id,
                title=m.title,
                recorded_at=m.recorded_at,
                status=str(m.status),
            )
            for m in meetings
        ],
        knowledge=knowledge,
    )
