"""Tests for DB queries used by meeting pipeline recovery."""

import pytest

from app.database.models.meeting import MeetingStatusEnum
from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.meeting_processing import MeetingProcessingRepository


@pytest.mark.asyncio
async def test_list_scheduled_incomplete_pipeline_includes_pending(
    test_db_session,
    test_user,
) -> None:
    m = await MeetingRepository.create(
        test_db_session,
        user_id=test_user["id"],
        storage_path="user_x/m1",
        id="meet-rec-1",
        status=MeetingStatusEnum.PROCESSING,
    )
    await MeetingProcessingRepository.upsert_after_sync(
        test_db_session,
        m.id,
        has_recording=True,
    )
    await test_db_session.commit()

    rows = await MeetingProcessingRepository.list_scheduled_incomplete_pipeline(test_db_session)
    paths = {r[1] for r in rows}
    assert "user_x/m1" in paths


@pytest.mark.asyncio
async def test_list_scheduled_incomplete_pipeline_excludes_completed(
    test_db_session,
    test_user,
) -> None:
    m = await MeetingRepository.create(
        test_db_session,
        user_id=test_user["id"],
        storage_path="user_x/m2",
        id="meet-rec-2",
        status=MeetingStatusEnum.COMPLETED,
    )
    await MeetingProcessingRepository.upsert_after_sync(
        test_db_session,
        m.id,
        has_recording=True,
    )
    await MeetingProcessingRepository.mark_completed(
        test_db_session,
        m.id,
        provider="deepgram",
        utterance_count=1,
        distinct_speaker_labels=1,
        enriched_transcript_saved=True,
        has_nonempty_diarization=True,
    )
    await test_db_session.commit()

    rows = await MeetingProcessingRepository.list_scheduled_incomplete_pipeline(test_db_session)
    ids = {r[0] for r in rows}
    assert "meet-rec-2" not in ids
