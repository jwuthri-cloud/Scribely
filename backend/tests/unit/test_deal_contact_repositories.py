"""Tests for DealRepository, ContactRepository, ContactKnowledgeRepository."""

import pytest

from app.database.models.knowledge import KnowledgeCategoryEnum
from app.database.repositories import (
    ContactKnowledgeRepository,
    ContactRepository,
    DealRepository,
    UserRepository,
)
from app.database.repositories.meeting import MeetingRepository


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.database
class TestDealAndContactRepositories:
    async def _make_user(self, db):
        return await UserRepository.create(
            db=db, clerk_id="user_deal_test", email="julien@scribely.com"
        )

    async def test_deal_get_or_create_idempotent(self, test_db_session):
        user = await self._make_user(test_db_session)
        d1 = await DealRepository.get_or_create(
            test_db_session, user.id, "acme.com", default_name="Acme"
        )
        d2 = await DealRepository.get_or_create(test_db_session, user.id, "acme.com")
        assert d1.id == d2.id
        assert d1.name == "Acme"

    async def test_contact_upsert_updates_metadata(self, test_db_session):
        user = await self._make_user(test_db_session)
        c1 = await ContactRepository.upsert(
            test_db_session, user.id, "Jade@Acme.com", full_name=None
        )
        assert c1.email == "jade@acme.com"
        assert c1.full_name is None

        c2 = await ContactRepository.upsert(
            test_db_session, user.id, "jade@acme.com", full_name="Jade"
        )
        assert c1.id == c2.id
        assert c2.full_name == "Jade"

    async def test_list_for_user_counts(self, test_db_session):
        user = await self._make_user(test_db_session)
        deal = await DealRepository.get_or_create(test_db_session, user.id, "acme.com")
        await ContactRepository.upsert(
            test_db_session, user.id, "a@acme.com", deal_id=deal.id
        )
        await ContactRepository.upsert(
            test_db_session, user.id, "b@acme.com", deal_id=deal.id
        )
        await test_db_session.flush()

        rows = await DealRepository.list_for_user(test_db_session, user.id)
        assert len(rows) == 1
        _, contact_count, meeting_count = rows[0]
        assert contact_count == 2
        assert meeting_count == 0

    async def test_knowledge_bulk_create(self, test_db_session):
        user = await self._make_user(test_db_session)
        deal = await DealRepository.get_or_create(test_db_session, user.id, "acme.com")
        contact = await ContactRepository.upsert(
            test_db_session, user.id, "a@acme.com", deal_id=deal.id
        )
        meeting = await MeetingRepository.create(
            test_db_session,
            user_id=user.id,
            storage_path="/tmp/m1",
            title="Kickoff",
        )

        await ContactKnowledgeRepository.bulk_create(
            test_db_session,
            user_id=user.id,
            meeting_id=meeting.id,
            deal_id=deal.id,
            entries=[
                {
                    "contact_id": contact.id,
                    "fact": "Owns the platform team",
                    "category": "role",
                    "confidence": 0.9,
                    "source_snippet": "I run platform",
                },
                {
                    "contact_id": contact.id,
                    "fact": "Wants async updates",
                    "category": KnowledgeCategoryEnum.PREFERENCE,
                    "confidence": 0.7,
                },
            ],
        )

        for_contact = await ContactKnowledgeRepository.list_for_contact(
            test_db_session, user.id, contact.id
        )
        assert len(for_contact) == 2

        for_meeting = await ContactKnowledgeRepository.list_for_meeting(
            test_db_session, user.id, meeting.id
        )
        assert len(for_meeting) == 2

        for_deal = await ContactKnowledgeRepository.list_for_deal(
            test_db_session, user.id, deal.id
        )
        assert len(for_deal) == 2

    async def test_contact_set_deal_for_user(self, test_db_session):
        user = await self._make_user(test_db_session)
        d1 = await DealRepository.get_or_create(test_db_session, user.id, "acme.com")
        d2 = await DealRepository.get_or_create(test_db_session, user.id, "beta.io")
        c = await ContactRepository.upsert(test_db_session, user.id, "x@acme.com")
        assert c.deal_id is None

        u1 = await ContactRepository.set_deal_for_user(
            test_db_session, user.id, c.id, d1.id
        )
        assert u1 is not None and u1.deal_id == d1.id

        u2 = await ContactRepository.set_deal_for_user(
            test_db_session, user.id, c.id, d2.id
        )
        assert u2 is not None and u2.deal_id == d2.id

        cleared = await ContactRepository.set_deal_for_user(
            test_db_session, user.id, c.id, None
        )
        assert cleared is not None and cleared.deal_id is None

        bad = await ContactRepository.set_deal_for_user(
            test_db_session, user.id, c.id, "not-a-real-deal-id"
        )
        assert bad is None
