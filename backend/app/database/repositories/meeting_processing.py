"""
Repository for MeetingProcessing (1:1 pipeline state per meeting).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models.meeting import Meeting
from app.database.models.meeting_processing import (
    MeetingProcessing,
    MeetingProcessingStatus,
    PipelineEligibility,
)
from app.utils.logging import get_logger

logger = get_logger("meeting_processing_repository")

MAX_ERROR_MESSAGE_LEN = 8000
MAX_TRACEBACK_LEN = 32000


def _utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _truncate(text: str | None, max_len: int) -> str | None:
    if text is None:
        return None
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


class MeetingProcessingRepository:
    @staticmethod
    async def get_by_meeting_id(
        db: AsyncSession,
        meeting_id: str,
    ) -> Optional[MeetingProcessing]:
        result = await db.execute(
            select(MeetingProcessing).where(MeetingProcessing.meeting_id == meeting_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_scheduled_incomplete_pipeline(
        db: AsyncSession,
    ) -> list[tuple[str, str]]:
        """Meetings whose pipeline is still scheduled but not finished (startup recovery).

        Returns ``(meeting_id, storage_path)`` for rows with eligibility *scheduled*
        and status *pending* or *processing*.
        """
        stmt = (
            select(Meeting.id, Meeting.storage_path)
            .join(MeetingProcessing, MeetingProcessing.meeting_id == Meeting.id)
            .where(
                MeetingProcessing.pipeline_eligibility == PipelineEligibility.SCHEDULED,
                MeetingProcessing.processing_status.in_(
                    (
                        MeetingProcessingStatus.PENDING,
                        MeetingProcessingStatus.PROCESSING,
                    )
                ),
            )
        )
        result = await db.execute(stmt)
        return list(result.all())

    @staticmethod
    async def upsert_after_sync(
        db: AsyncSession,
        meeting_id: str,
        *,
        has_recording: bool,
    ) -> MeetingProcessing:
        """Initial row right after meeting upload: transcript-only vs pipeline scheduled."""
        now = _utc_naive()
        row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
        if row is None:
            row = MeetingProcessing(
                meeting_id=meeting_id, created_at=now, updated_at=now
            )
            db.add(row)

        if not has_recording:
            row.pipeline_eligibility = PipelineEligibility.NOT_APPLICABLE
            row.processing_status = MeetingProcessingStatus.NONE
            row.diarization_provider = None
        else:
            row.pipeline_eligibility = PipelineEligibility.SCHEDULED
            row.processing_status = MeetingProcessingStatus.PENDING

        row.updated_at = now
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def mark_pending(
        db: AsyncSession,
        meeting_id: str,
    ) -> None:
        """Re-run scheduled: reset errors, set pending (e.g. reprocess)."""
        now = _utc_naive()
        row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
        if row is None:
            row = MeetingProcessing(
                meeting_id=meeting_id,
                pipeline_eligibility=PipelineEligibility.SCHEDULED,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        row.pipeline_eligibility = PipelineEligibility.SCHEDULED
        row.processing_status = MeetingProcessingStatus.PENDING
        row.last_error_message = None
        row.last_error_traceback = None
        row.failed_step = None
        row.failed_at = None
        row.updated_at = now
        await db.flush()

    @staticmethod
    async def mark_processing(
        db: AsyncSession,
        meeting_id: str,
    ) -> None:
        now = _utc_naive()
        row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
        if row is None:
            row = MeetingProcessing(
                meeting_id=meeting_id,
                pipeline_eligibility=PipelineEligibility.SCHEDULED,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        row.processing_status = MeetingProcessingStatus.PROCESSING
        row.started_at = now
        row.updated_at = now
        await db.flush()

    @staticmethod
    async def mark_completed(
        db: AsyncSession,
        meeting_id: str,
        *,
        provider: str,
        utterance_count: int,
        distinct_speaker_labels: int,
        enriched_transcript_saved: bool,
        has_nonempty_diarization: bool,
        result_summary: Optional[dict[str, Any]] = None,
    ) -> None:
        now = _utc_naive()
        row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
        if row is None:
            row = MeetingProcessing(
                meeting_id=meeting_id,
                pipeline_eligibility=PipelineEligibility.SCHEDULED,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        row.pipeline_eligibility = PipelineEligibility.SCHEDULED
        row.processing_status = MeetingProcessingStatus.COMPLETED
        row.completed_at = now
        row.failed_at = None
        row.failed_step = None
        row.last_error_message = None
        row.last_error_traceback = None
        row.diarization_provider = provider
        row.utterance_count = utterance_count
        row.distinct_speaker_labels = distinct_speaker_labels
        row.enriched_transcript_saved = enriched_transcript_saved
        row.has_nonempty_diarization = has_nonempty_diarization
        row.result_summary = result_summary
        row.updated_at = now
        await db.flush()

    @staticmethod
    async def mark_failed(
        db: AsyncSession,
        meeting_id: str,
        *,
        message: str,
        failed_step: Optional[str] = None,
        traceback_str: Optional[str] = None,
    ) -> None:
        now = _utc_naive()
        row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
        if row is None:
            row = MeetingProcessing(
                meeting_id=meeting_id,
                pipeline_eligibility=PipelineEligibility.SCHEDULED,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        row.processing_status = MeetingProcessingStatus.FAILED
        row.failed_at = now
        row.failed_step = failed_step
        row.last_error_message = _truncate(message, MAX_ERROR_MESSAGE_LEN)
        row.last_error_traceback = _truncate(traceback_str, MAX_TRACEBACK_LEN)
        row.updated_at = now
        await db.flush()
