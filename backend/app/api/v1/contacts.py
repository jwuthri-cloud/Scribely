"""Contacts API."""

from __future__ import annotations

from typing import Optional

from app.api.deps import get_current_user_with_db
from app.database.models.deal import Deal
from app.database.models.meeting import Meeting
from app.database.models.user import User
from app.database.repositories.contact import ContactRepository
from app.database.repositories.knowledge import ContactKnowledgeRepository
from app.database.session import get_async_db_session
from app.models.deal import (
    ContactDetailOut,
    ContactListResponse,
    ContactPatchIn,
    ContactSummaryOut,
    KnowledgeEntryOut,
)
from app.utils.logging import get_logger
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("contacts_api")
router = APIRouter()


@router.get("", response_model=ContactListResponse)
async def list_contacts(
    deal_id: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> ContactListResponse:
    contacts = await ContactRepository.list_for_user(db, user.id, deal_id=deal_id)
    return ContactListResponse(
        contacts=[ContactSummaryOut.model_validate(c) for c in contacts],
        total=len(contacts),
    )


def _contact_to_detail(
    *,
    contact,
    deal: Optional[Deal],
    knowledge: list,
    meeting_by_id: dict[str, Meeting],
) -> ContactDetailOut:
    knowledge_out = [
        KnowledgeEntryOut(
            id=k.id,
            contact_id=k.contact_id,
            contact_email=contact.email,
            contact_name=contact.full_name,
            deal_id=k.deal_id,
            meeting_id=k.meeting_id,
            meeting_title=meeting_by_id.get(k.meeting_id).title
            if meeting_by_id.get(k.meeting_id)
            else None,
            meeting_recorded_at=meeting_by_id.get(k.meeting_id).recorded_at
            if meeting_by_id.get(k.meeting_id)
            else None,
            fact=k.fact,
            category=str(k.category),
            confidence=k.confidence,
            source_snippet=k.source_snippet,
            created_at=k.created_at,
        )
        for k in knowledge
    ]
    return ContactDetailOut(
        id=contact.id,
        email=contact.email,
        full_name=contact.full_name,
        deal_id=contact.deal_id,
        deal_name=deal.name if deal else None,
        deal_domain=deal.domain if deal else None,
        first_seen_at=contact.first_seen_at,
        last_seen_at=contact.last_seen_at,
        knowledge=knowledge_out,
    )


@router.get("/{contact_id}", response_model=ContactDetailOut)
async def get_contact(
    contact_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> ContactDetailOut:
    contact = await ContactRepository.get_by_id(db, contact_id, user_id=user.id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")

    deal = None
    if contact.deal_id:
        deal_res = await db.execute(select(Deal).where(Deal.id == contact.deal_id))
        deal = deal_res.scalar_one_or_none()

    knowledge_rows = await ContactKnowledgeRepository.list_for_contact(
        db, user.id, contact_id
    )
    meeting_ids = {k.meeting_id for k in knowledge_rows}
    meeting_by_id: dict[str, Meeting] = {}
    if meeting_ids:
        m_res = await db.execute(
            select(Meeting).where(Meeting.id.in_(meeting_ids))
        )
        meeting_by_id = {m.id: m for m in m_res.scalars().all()}

    return _contact_to_detail(
        contact=contact,
        deal=deal,
        knowledge=knowledge_rows,
        meeting_by_id=meeting_by_id,
    )


@router.patch("/{contact_id}", response_model=ContactDetailOut)
async def patch_contact(
    contact_id: str,
    body: ContactPatchIn,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> ContactDetailOut:
    updated = await ContactRepository.set_deal_for_user(
        db, user.id, contact_id, body.deal_id
    )
    if updated is None:
        if await ContactRepository.get_by_id(db, contact_id, user_id=user.id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid deal_id (deal not found or not yours)",
        )

    deal = None
    if updated.deal_id:
        deal_res = await db.execute(select(Deal).where(Deal.id == updated.deal_id))
        deal = deal_res.scalar_one_or_none()

    knowledge_rows = await ContactKnowledgeRepository.list_for_contact(
        db, user.id, contact_id
    )
    meeting_ids = {k.meeting_id for k in knowledge_rows}
    meeting_by_id: dict[str, Meeting] = {}
    if meeting_ids:
        m_res = await db.execute(select(Meeting).where(Meeting.id.in_(meeting_ids)))
        meeting_by_id = {m.id: m for m in m_res.scalars().all()}

    await db.commit()

    return _contact_to_detail(
        contact=updated,
        deal=deal,
        knowledge=knowledge_rows,
        meeting_by_id=meeting_by_id,
    )
