"""Pydantic schemas for deals and contacts API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DealSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain: str
    name: str
    status: str
    contact_count: int = 0
    meeting_count: int = 0
    created_at: datetime
    updated_at: datetime


class DealListResponse(BaseModel):
    deals: list[DealSummaryOut]
    total: int


class ContactSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: Optional[str]
    deal_id: Optional[str]
    first_seen_at: datetime
    last_seen_at: datetime


class KnowledgeEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    contact_id: str
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    deal_id: Optional[str]
    meeting_id: str
    meeting_title: Optional[str] = None
    meeting_recorded_at: Optional[datetime] = None
    fact: str
    category: str
    confidence: float
    source_snippet: Optional[str]
    created_at: datetime


class MeetingRefOut(BaseModel):
    id: str
    title: Optional[str]
    recorded_at: Optional[datetime]
    status: str


class DealDetailOut(BaseModel):
    id: str
    domain: str
    name: str
    status: str
    created_at: datetime
    updated_at: datetime
    contacts: list[ContactSummaryOut]
    recent_meetings: list[MeetingRefOut]
    knowledge: list[KnowledgeEntryOut]


class ContactListResponse(BaseModel):
    contacts: list[ContactSummaryOut]
    total: int


class ContactDetailOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    deal_id: Optional[str]
    deal_name: Optional[str] = None
    deal_domain: Optional[str] = None
    first_seen_at: datetime
    last_seen_at: datetime
    knowledge: list[KnowledgeEntryOut]


class ContactPatchIn(BaseModel):
    """PATCH body for contact updates (e.g. assign or clear deal)."""

    deal_id: str | None
