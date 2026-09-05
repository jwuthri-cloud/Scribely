"""
Meeting sync and post-processing endpoints.

Receives meeting data from the Electron desktop app after a meeting ends.
Accepts multipart/form-data with the transcript JSON file and optionally the
webm recording file. Files are stored under:
  {UPLOAD_DIR}/{user_id}/{meeting_id}/recording.webm
  {UPLOAD_DIR}/{user_id}/{meeting_id}/transcript.json

When OBJECT_STORAGE_ENABLED and S3_* are set, the same paths are mirrored to the
bucket (e.g. MinIO) so artifacts survive ephemeral container disk.

After upload, background diarization + speaker identification is triggered
automatically when a recording is present.
"""

import asyncio
import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import aiofiles
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_with_db
from app.config import get_settings
from app.database.models.meeting import MeetingStatusEnum
from app.database.models.meeting_processing import (
    MeetingProcessing,
    PipelineEligibility,
)
from app.database.models.user import User
from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.meeting_processing import MeetingProcessingRepository
from app.database.repositories.rule import RuleRepository
from app.database.session import get_async_db_session
from app.infrastructure.object_storage import (
    RECORDING_WEBM,
    TRANSCRIPT_ENRICHED_JSON,
    TRANSCRIPT_JSON,
    is_object_storage_configured,
    mirror_meeting_from_object_storage_async,
    upload_file_async,
)
from app.services.task_runner import TaskStatus, read_status, schedule_processing
from app.utils.logging import get_logger

logger = get_logger("meetings_api")

router = APIRouter()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class MeetingSyncResponse(BaseModel):
    success: bool
    message: str
    meetingId: Optional[str] = None


class ProcessingStatusResponse(BaseModel):
    meetingId: str
    status: str
    speakerMap: Optional[dict[str, str]] = None
    utteranceCount: Optional[int] = None
    error: Optional[str] = None
    failedStep: Optional[str] = None
    updatedAt: Optional[str] = None


class EnrichedTranscriptResponse(BaseModel):
    meetingId: str
    hasEnrichedTranscript: bool
    transcript: Optional[dict[str, Any]] = None


class MeetingSummaryResponse(BaseModel):
    id: str
    title: Optional[str] = None
    duration_seconds: Optional[int] = None
    entry_count: int
    status: str
    recorded_at: Optional[str] = None
    created_at: str


class MeetingProcessingOut(BaseModel):
    """Persisted pipeline state (1:1 ``meeting_processing`` row)."""

    pipeline_eligibility: str
    processing_status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    diarization_provider: Optional[str] = None
    utterance_count: Optional[int] = None
    distinct_speaker_labels: Optional[int] = None
    enriched_transcript_saved: bool = False
    has_nonempty_diarization: bool = False
    last_error_message: Optional[str] = None
    failed_step: Optional[str] = None
    result_summary: Optional[dict[str, Any]] = None


class MeetingDetailResponse(MeetingSummaryResponse):
    processing: Optional[MeetingProcessingOut] = None
    # True when a recording was uploaded (webm); False for transcript-only meetings.
    has_recording: bool = False


class TranscriptLinePatch(BaseModel):
    speaker: str
    text: str


class PatchTranscriptRequest(BaseModel):
    entries: list[TranscriptLinePatch]


class PaginatedMeetingsResponse(BaseModel):
    meetings: list[MeetingSummaryResponse]
    total: int
    page: int
    limit: int
    pages: int


class MonthlyMeetingCount(BaseModel):
    month: str
    count: int


class DashboardStatsResponse(BaseModel):
    total_meetings: int
    total_duration_seconds: int
    total_transcript_lines: int
    completed_count: int
    processing_count: int
    recent_meetings: list[MeetingSummaryResponse]
    meetings_per_month: list[MonthlyMeetingCount]


class MeetingRuleExecutionItem(BaseModel):
    """One automation rule run for this meeting."""

    id: str
    rule_id: str
    rule_name: str
    trigger: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    # Per-step: step_id, name, step_type, ok, result, error (from rule engine)
    step_results: Optional[list[dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enum_value(v: Any) -> str:
    return v.value if hasattr(v, "value") else str(v)


def _has_recording_from_processing(proc: Optional[MeetingProcessing]) -> bool:
    if proc is None:
        return False
    pe = proc.pipeline_eligibility
    val = pe.value if isinstance(pe, PipelineEligibility) else str(pe)
    return val != PipelineEligibility.NOT_APPLICABLE.value


def _apply_transcript_line_edits(data: Any, edits: list[TranscriptLinePatch]) -> None:
    """Mutate loaded transcript JSON in-place to apply speaker/text edits by row index."""
    n = len(edits)
    if isinstance(data, list):
        if len(data) != n:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Entry count does not match transcript",
            )
        for i, patch in enumerate(edits):
            row = data[i]
            if not isinstance(row, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid transcript row",
                )
            row["speaker"] = patch.speaker.strip() or "Speaker"
            row["text"] = patch.text
        return

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported transcript shape",
        )

    diar = data.get("diarization")
    utterances: Optional[list] = None
    if isinstance(diar, dict):
        u = diar.get("utterances")
        if isinstance(u, list) and len(u) > 0:
            utterances = u

    if utterances is not None:
        if len(utterances) != n:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Entry count does not match transcript",
            )
        speakers: set[str] = set()
        for i, patch in enumerate(edits):
            utt = utterances[i]
            if not isinstance(utt, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid utterance row",
                )
            utt["speaker"] = patch.speaker.strip() or "Speaker"
            utt["text"] = patch.text
            speakers.add(utt["speaker"])
        diar["utteranceCount"] = len(utterances)
        diar["speakers"] = sorted(speakers)
        return

    entries = data.get("entries")
    if not isinstance(entries, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported transcript shape",
        )
    if len(entries) != n:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Entry count does not match transcript",
        )
    speakers_list: list[str] = []
    for i, patch in enumerate(edits):
        ent = entries[i]
        if not isinstance(ent, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid entry row",
            )
        ent["speaker"] = patch.speaker.strip() or "Speaker"
        ent["text"] = patch.text
        speakers_list.append(ent["speaker"])
    summary = data.get("summary")
    if isinstance(summary, dict):
        summary["totalEntries"] = len(entries)
        summary["speakers"] = list(dict.fromkeys(speakers_list))


def _processing_out_from_row(row: MeetingProcessing) -> MeetingProcessingOut:
    return MeetingProcessingOut(
        pipeline_eligibility=_enum_value(row.pipeline_eligibility),
        processing_status=_enum_value(row.processing_status),
        started_at=row.started_at.isoformat() if row.started_at else None,
        completed_at=row.completed_at.isoformat() if row.completed_at else None,
        failed_at=row.failed_at.isoformat() if row.failed_at else None,
        diarization_provider=row.diarization_provider,
        utterance_count=row.utterance_count,
        distinct_speaker_labels=row.distinct_speaker_labels,
        enriched_transcript_saved=bool(row.enriched_transcript_saved),
        has_nonempty_diarization=bool(row.has_nonempty_diarization),
        last_error_message=row.last_error_message,
        failed_step=row.failed_step,
        result_summary=(
            row.result_summary if isinstance(row.result_summary, dict) else None
        ),
    )


async def _resolve_meeting_dir(
    db: AsyncSession,
    user: User,
    meeting_id: str,
) -> Path:
    """Return the on-disk meeting directory after DB + filesystem checks.

    The meeting list is backed by the database; transcript/status/reprocess need
    files under ``{upload_dir}/{storage_path}``. If the row exists but the folder
    does not (wrong ``UPLOAD_DIR``, wiped uploads, DB restored without files),
    raise 404 with a message that distinguishes that from an unknown id.
    """
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    settings = get_settings()
    meeting_dir = Path(settings.upload_dir) / meeting.storage_path
    if is_object_storage_configured() and (
        not meeting_dir.is_dir() or not (meeting_dir / "transcript.json").exists()
    ):
        await mirror_meeting_from_object_storage_async(
            meeting_dir, meeting.storage_path
        )

    if not meeting_dir.is_dir() or not (meeting_dir / "transcript.json").exists():
        logger.warning(
            "Meeting %s has DB row but missing directory: %s (upload_dir=%s)",
            meeting_id,
            meeting_dir,
            settings.upload_dir,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Transcript files for this meeting are not on this server. "
                "Check UPLOAD_DIR, object storage (S3/MinIO), or re-sync the meeting."
            ),
        )
    return meeting_dir


# ---------------------------------------------------------------------------
# GET /  — list meetings for current user (paginated)
# ---------------------------------------------------------------------------


@router.get("/", response_model=PaginatedMeetingsResponse)
async def list_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=200),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    meeting_status: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> PaginatedMeetingsResponse:
    """List meetings for the authenticated user with pagination and filters."""
    meetings, total = await MeetingRepository.list_for_user(
        db,
        user.id,
        page=page,
        limit=limit,
        search=search,
        date_from=date_from,
        date_to=date_to,
        status=meeting_status,
    )

    pages = math.ceil(total / limit) if total > 0 else 0

    return PaginatedMeetingsResponse(
        meetings=[
            MeetingSummaryResponse(
                id=m.id,
                title=m.title,
                duration_seconds=m.duration_seconds,
                entry_count=m.entry_count,
                status=(
                    m.status.value
                    if isinstance(m.status, MeetingStatusEnum)
                    else str(m.status)
                ),
                recorded_at=m.recorded_at.isoformat() if m.recorded_at else None,
                created_at=m.created_at.isoformat(),
            )
            for m in meetings
        ],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# GET /stats  — aggregated dashboard stats
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> DashboardStatsResponse:
    """Return aggregated meeting statistics for the dashboard."""
    total_meetings = await MeetingRepository.count_for_user(db, user.id)
    total_duration = await MeetingRepository.total_duration_for_user(db, user.id)
    total_lines = await MeetingRepository.total_entry_count_for_user(db, user.id)
    status_counts = await MeetingRepository.count_by_status_for_user(db, user.id)
    per_month = await MeetingRepository.meetings_per_month_for_user(db, user.id)

    recent, _ = await MeetingRepository.list_for_user(db, user.id, page=1, limit=5)

    return DashboardStatsResponse(
        total_meetings=total_meetings,
        total_duration_seconds=total_duration,
        total_transcript_lines=total_lines,
        completed_count=status_counts.get("completed", 0),
        processing_count=status_counts.get("processing", 0),
        recent_meetings=[
            MeetingSummaryResponse(
                id=m.id,
                title=m.title,
                duration_seconds=m.duration_seconds,
                entry_count=m.entry_count,
                status=(
                    m.status.value
                    if isinstance(m.status, MeetingStatusEnum)
                    else str(m.status)
                ),
                recorded_at=m.recorded_at.isoformat() if m.recorded_at else None,
                created_at=m.created_at.isoformat(),
            )
            for m in recent
        ],
        meetings_per_month=[
            MonthlyMeetingCount(month=row["month"], count=row["count"])
            for row in per_month
        ],
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}  — single meeting metadata
# ---------------------------------------------------------------------------


@router.get("/{meeting_id}", response_model=MeetingDetailResponse)
async def get_meeting(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> MeetingDetailResponse:
    """Return one meeting's summary row and optional persisted pipeline state."""
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    proc_row = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
    processing = _processing_out_from_row(proc_row) if proc_row else None
    has_recording = _has_recording_from_processing(proc_row)
    return MeetingDetailResponse(
        id=meeting.id,
        title=meeting.title,
        duration_seconds=meeting.duration_seconds,
        entry_count=meeting.entry_count,
        status=(
            meeting.status.value
            if isinstance(meeting.status, MeetingStatusEnum)
            else str(meeting.status)
        ),
        recorded_at=meeting.recorded_at.isoformat() if meeting.recorded_at else None,
        created_at=meeting.created_at.isoformat(),
        processing=processing,
        has_recording=has_recording,
    )


@router.get(
    "/{meeting_id}/rule-executions",
    response_model=list[MeetingRuleExecutionItem],
)
async def list_meeting_rule_executions(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> list[MeetingRuleExecutionItem]:
    """Automation rules that ran for this meeting (before/after triggers, tests)."""
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    rows = await RuleRepository.list_executions_for_meeting(db, meeting_id, user.id)
    out: list[MeetingRuleExecutionItem] = []
    for ex, rule_name in rows:
        sr = ex.step_results if isinstance(ex.step_results, list) else None
        out.append(
            MeetingRuleExecutionItem(
                id=ex.id,
                rule_id=ex.rule_id,
                rule_name=rule_name,
                trigger=str(ex.trigger),
                status=str(ex.status),
                started_at=ex.started_at.isoformat() if ex.started_at else None,
                completed_at=ex.completed_at.isoformat() if ex.completed_at else None,
                error=ex.error,
                step_results=sr,
            )
        )
    return out


def _build_recall_enriched(transcript_data: dict) -> dict:
    """Build a v2 enriched transcript from a Recall-sourced transcript whose entries
    already carry real speaker names. Mirrors meeting_processor._build_enriched so the
    web app renders Recall meetings identically to pipeline-diarized ones."""
    entries = (
        transcript_data.get("entries", []) if isinstance(transcript_data, dict) else []
    )
    utterances = []
    for e in entries:
        speaker = e.get("speaker") or "Speaker"
        utterances.append(
            {
                "speaker": speaker,
                "text": e.get("text", ""),
                "startMs": e.get("startTime", 0),
                "endMs": e.get("endTime", 0),
                "confidence": e.get("confidence", 1.0),
                "originalLabel": speaker,
            }
        )
    speakers = sorted({u["speaker"] for u in utterances})
    now_iso = datetime.now(timezone.utc).isoformat()
    created = (
        transcript_data.get("createdAt", now_iso)
        if isinstance(transcript_data, dict)
        else now_iso
    )
    return {
        "version": 2,
        "createdAt": created,
        "diarization": {
            "provider": "recall",
            "speakerMap": {s: s for s in speakers},
            "speakers": speakers,
            "processedAt": now_iso,
            "utteranceCount": len(utterances),
            "utterances": utterances,
        },
        "entries": entries,
        "summary": (
            transcript_data.get("summary", {})
            if isinstance(transcript_data, dict)
            else {}
        ),
    }


# ---------------------------------------------------------------------------
# POST /  — upload meeting files
# ---------------------------------------------------------------------------


@router.post("/", response_model=MeetingSyncResponse)
async def sync_meeting(
    transcript: UploadFile = File(..., description="Transcript JSON file"),
    video: Optional[UploadFile] = File(None, description="Meeting recording (.webm)"),
    session_id: Optional[str] = Form(None, alias="sessionId"),
    calendar_event_id: Optional[str] = Form(None, alias="calendarEventId"),
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> MeetingSyncResponse:
    """
    Receive meeting files from the desktop app.

    Requires Clerk JWT authentication. Accepts multipart/form-data:
    - transcript (required): the transcript JSON file
    - video (optional): the webm recording file
    - sessionId (optional): meeting session identifier
    - calendarEventId (optional): synced calendar event id — used for participant-based diarization hints

    Files are stored at {UPLOAD_DIR}/{user_id}/{meeting_id}/
    When a video recording is included, background diarization + speaker
    identification is triggered automatically.
    """
    settings = get_settings()
    meeting_id = str(uuid.uuid4())
    upload_base = Path(settings.upload_dir)
    meeting_dir = upload_base / str(user.id) / meeting_id

    try:
        meeting_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.error(f"Failed to create upload directory {meeting_dir}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create storage directory",
        )

    storage_rel = f"{user.id}/{meeting_id}"

    # --- Save transcript JSON ---
    transcript_content = await transcript.read()
    if len(transcript_content) > settings.max_transcript_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Transcript file exceeds maximum allowed size ({settings.max_transcript_size_bytes // (1024*1024)}MB)",
        )

    transcript_path = meeting_dir / "transcript.json"
    async with aiofiles.open(transcript_path, "wb") as f:
        await f.write(transcript_content)

    if is_object_storage_configured():
        await upload_file_async(transcript_path, storage_rel, TRANSCRIPT_JSON)

    logger.info(
        f"Transcript saved for user {user.id} (clerk={user.clerk_id}): "
        f"{len(transcript_content)} bytes → {transcript_path}"
    )

    # --- Save webm recording (optional) ---
    recording_path: Optional[Path] = None
    if video is not None:
        video_path = meeting_dir / "recording.webm"
        total_bytes = 0
        chunk_size = 1024 * 1024  # 1MB chunks

        async with aiofiles.open(video_path, "wb") as f:
            while True:
                chunk = await video.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.max_video_size_bytes:
                    await f.close()
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Video file exceeds maximum allowed size ({settings.max_video_size_bytes // (1024*1024)}MB)",
                    )
                await f.write(chunk)

        recording_path = video_path
        if is_object_storage_configured():
            await upload_file_async(recording_path, storage_rel, RECORDING_WEBM)
        logger.info(
            f"Recording saved for user {user.id}: "
            f"{total_bytes / (1024*1024):.1f}MB → {recording_path}"
        )

    meeting_type = "transcript + recording" if recording_path else "transcript only"
    logger.info(
        f"Meeting {meeting_id} stored ({meeting_type}), "
        f"user={user.id}, session={session_id}"
    )

    # --- Create DB record ---
    entry_count = 0
    duration_seconds = None
    recorded_at = None
    title = None
    provider_tag = None
    recall_upload_id_tag = None
    transcript_data = {}
    try:
        transcript_data = json.loads(transcript_content)
        entries = (
            transcript_data
            if isinstance(transcript_data, list)
            else transcript_data.get("entries", [])
        )
        entry_count = len(entries)
        if isinstance(transcript_data, dict):
            provider_tag = transcript_data.get("provider")
            recall_upload_id_tag = transcript_data.get("recallUploadId")
        if entries:
            first_ts = entries[0].get("timestamp", 0)
            last_ts = entries[-1].get("timestamp", 0)
            if isinstance(last_ts, (int, float)) and isinstance(first_ts, (int, float)):
                duration_seconds = max(0, int(last_ts - first_ts))
        meta = (
            transcript_data.get("metadata", {})
            if isinstance(transcript_data, dict)
            else {}
        )
        title = meta.get("title")
        if meta.get("startTime"):
            try:
                recorded_at = datetime.fromisoformat(
                    meta["startTime"].replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except (ValueError, AttributeError):
                pass
    except (json.JSONDecodeError, KeyError, TypeError):
        pass

    if recorded_at is None:
        recorded_at = datetime.now(timezone.utc).replace(tzinfo=None)

    cal_id = (
        calendar_event_id.strip()
        if calendar_event_id and calendar_event_id.strip()
        else None
    )
    if cal_id:
        ev = await CalendarRepository.get_event_by_id(
            db, cal_id, user.id, with_participants=False
        )
        if not ev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="calendarEventId not found or not accessible for this user",
            )

    # Recall transcripts arrive already diarized with real speaker names — never run
    # the Deepgram/AssemblyAI pipeline on them (gated also on the user's entitlement).
    is_recall = provider_tag == "recall" and bool(user.use_recall_sdk)

    initial_status = (
        MeetingStatusEnum.PROCESSING
        if (recording_path is not None and not is_recall)
        else MeetingStatusEnum.COMPLETED
    )

    db_meeting = await MeetingRepository.create(
        db,
        user_id=user.id,
        id=meeting_id,
        storage_path=storage_rel,
        session_id=session_id,
        calendar_event_id=cal_id,
        recall_upload_id=recall_upload_id_tag,
        title=title,
        duration_seconds=duration_seconds,
        entry_count=entry_count,
        status=initial_status,
        recorded_at=recorded_at,
    )
    await MeetingProcessingRepository.upsert_after_sync(
        db,
        db_meeting.id,
        has_recording=recording_path is not None,
    )

    # Recall-sourced: write the enriched transcript ourselves and mark the pipeline
    # complete (provider=recall) — no Deepgram/AssemblyAI run.
    if is_recall:
        enriched = _build_recall_enriched(transcript_data)
        enriched_path = meeting_dir / TRANSCRIPT_ENRICHED_JSON
        try:
            async with aiofiles.open(enriched_path, "w") as f:
                await f.write(json.dumps(enriched, indent=2, ensure_ascii=False))
            if is_object_storage_configured():
                await upload_file_async(
                    enriched_path, storage_rel, TRANSCRIPT_ENRICHED_JSON
                )
        except OSError as e:
            logger.error(
                f"Failed to write recall enriched transcript for {db_meeting.id}: {e}"
            )
        diar = enriched["diarization"]
        await MeetingProcessingRepository.mark_completed(
            db,
            db_meeting.id,
            provider="recall",
            utterance_count=diar["utteranceCount"],
            distinct_speaker_labels=len(diar["speakers"]),
            enriched_transcript_saved=True,
            has_nonempty_diarization=diar["utteranceCount"] > 0,
            result_summary={"source": "recall"},
        )

    await db.commit()

    # Lifecycle rules: before every upload; after when there is no recording pipeline
    # (otherwise `after_meeting` runs from task_runner when processing completes).
    try:
        from app.database.models.rule import RuleTriggerEnum
        from app.services.rule_engine import execute_rules_for_meeting

        asyncio.create_task(
            execute_rules_for_meeting(db_meeting.id, RuleTriggerEnum.BEFORE_MEETING)
        )
        if recording_path is None or is_recall:
            asyncio.create_task(
                execute_rules_for_meeting(db_meeting.id, RuleTriggerEnum.AFTER_MEETING)
            )
    except Exception as e:
        logger.warning("Failed to schedule meeting rules for %s: %s", db_meeting.id, e)

    # --- Trigger background processing if we have a recording (never for Recall —
    # its transcript is already diarized) ---
    if recording_path is not None and not is_recall:
        schedule_processing(meeting_dir, meeting_id=db_meeting.id)
        logger.info(f"Background diarization scheduled for meeting {db_meeting.id}")
    elif is_recall:
        logger.info(f"Meeting {db_meeting.id} is Recall-sourced — diarization skipped")

    return MeetingSyncResponse(
        success=True,
        message=f"Meeting stored ({meeting_type})",
        meetingId=meeting_id,
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}/knowledge  — deal + per-contact facts extracted from meeting
# ---------------------------------------------------------------------------


class MeetingKnowledgeResponse(BaseModel):
    deal: Optional[dict[str, Any]] = None
    entries: list[dict[str, Any]] = []


@router.get("/{meeting_id}/knowledge", response_model=MeetingKnowledgeResponse)
async def get_meeting_knowledge(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> MeetingKnowledgeResponse:
    """Return the detected deal and per-contact knowledge for a meeting."""
    from sqlalchemy import select

    from app.database.models.contact import Contact
    from app.database.models.deal import Deal
    from app.database.models.knowledge import ContactKnowledge

    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found"
        )

    deal_payload: Optional[dict[str, Any]] = None
    if meeting.deal_id:
        d_res = await db.execute(select(Deal).where(Deal.id == meeting.deal_id))
        deal = d_res.scalar_one_or_none()
        if deal is not None:
            deal_payload = {
                "id": deal.id,
                "domain": deal.domain,
                "name": deal.name,
                "status": str(deal.status),
            }

    k_res = await db.execute(
        select(ContactKnowledge)
        .where(
            ContactKnowledge.user_id == user.id,
            ContactKnowledge.meeting_id == meeting_id,
        )
        .order_by(ContactKnowledge.created_at.desc())
    )
    rows = list(k_res.scalars().all())
    contact_ids = {r.contact_id for r in rows}
    contact_by_id: dict[str, Contact] = {}
    if contact_ids:
        c_res = await db.execute(select(Contact).where(Contact.id.in_(contact_ids)))
        contact_by_id = {c.id: c for c in c_res.scalars().all()}

    entries = [
        {
            "id": r.id,
            "contact_id": r.contact_id,
            "contact_email": (
                contact_by_id.get(r.contact_id).email
                if contact_by_id.get(r.contact_id)
                else None
            ),
            "contact_name": (
                contact_by_id.get(r.contact_id).full_name
                if contact_by_id.get(r.contact_id)
                else None
            ),
            "fact": r.fact,
            "category": str(r.category),
            "confidence": r.confidence,
            "source_snippet": r.source_snippet,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return MeetingKnowledgeResponse(deal=deal_payload, entries=entries)


# ---------------------------------------------------------------------------
# GET /{meeting_id}/status  — processing status
# ---------------------------------------------------------------------------


@router.get("/{meeting_id}/status", response_model=ProcessingStatusResponse)
async def get_processing_status(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> ProcessingStatusResponse:
    """Return the diarization / speaker-identification processing status."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)
    info = read_status(meeting_dir)

    err = info.get("error")
    failed_step = info.get("failedStep")
    mp = await MeetingProcessingRepository.get_by_meeting_id(db, meeting_id)
    if mp and mp.last_error_message:
        err = mp.last_error_message
    if mp and mp.failed_step:
        failed_step = mp.failed_step

    return ProcessingStatusResponse(
        meetingId=meeting_id,
        status=info.get("status", "none"),
        speakerMap=info.get("speakerMap"),
        utteranceCount=info.get("utteranceCount"),
        error=err,
        failedStep=failed_step,
        updatedAt=info.get("updatedAt"),
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}/transcript  — enriched (or original) transcript
# ---------------------------------------------------------------------------


@router.get("/{meeting_id}/transcript", response_model=EnrichedTranscriptResponse)
async def get_transcript(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> EnrichedTranscriptResponse:
    """Return the enriched transcript if available, otherwise the original."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)

    enriched_path = meeting_dir / "transcript_enriched.json"
    original_path = meeting_dir / "transcript.json"

    if enriched_path.exists():
        data = json.loads(enriched_path.read_text())
        return EnrichedTranscriptResponse(
            meetingId=meeting_id,
            hasEnrichedTranscript=True,
            transcript=data,
        )

    if original_path.exists():
        data = json.loads(original_path.read_text())
        return EnrichedTranscriptResponse(
            meetingId=meeting_id,
            hasEnrichedTranscript=False,
            transcript=data,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No transcript found for this meeting",
    )


# ---------------------------------------------------------------------------
# PATCH /{meeting_id}/transcript  — edit speaker / line text (same file as GET)
# ---------------------------------------------------------------------------


@router.patch("/{meeting_id}/transcript", response_model=EnrichedTranscriptResponse)
async def patch_transcript(
    meeting_id: str,
    body: PatchTranscriptRequest,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> EnrichedTranscriptResponse:
    """Apply text/speaker edits to the stored transcript (enriched if present, else original)."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)
    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    enriched_path = meeting_dir / "transcript_enriched.json"
    original_path = meeting_dir / "transcript.json"
    target = enriched_path if enriched_path.exists() else original_path

    raw: Any = json.loads(target.read_text(encoding="utf-8"))
    _apply_transcript_line_edits(raw, body.entries)

    out = json.dumps(raw, indent=2, ensure_ascii=False)
    async with aiofiles.open(target, "w", encoding="utf-8") as f:
        await f.write(out)

    if is_object_storage_configured():
        fname = (
            TRANSCRIPT_ENRICHED_JSON
            if target.name == "transcript_enriched.json"
            else TRANSCRIPT_JSON
        )
        await upload_file_async(target, meeting.storage_path, fname)

    await MeetingRepository.update_entry_count(db, meeting_id, len(body.entries))
    await db.commit()

    transcript_out: dict[str, Any]
    if isinstance(raw, dict):
        transcript_out = raw
    else:
        transcript_out = {"entries": raw}

    return EnrichedTranscriptResponse(
        meetingId=meeting_id,
        hasEnrichedTranscript=enriched_path.exists(),
        transcript=transcript_out,
    )


# ---------------------------------------------------------------------------
# GET /{meeting_id}/recording  — webm video (for dashboard playback)
# ---------------------------------------------------------------------------


@router.get("/{meeting_id}/recording")
async def get_meeting_recording(
    meeting_id: str,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> FileResponse:
    """Stream the meeting recording. Base SDK records WebM; Recall provides MP4 — serve
    whichever exists. Same auth as other meeting APIs."""
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)
    webm_path = meeting_dir / RECORDING_WEBM
    mp4_path = meeting_dir / "recording.mp4"
    if webm_path.is_file():
        recording_path, media_type = webm_path, "video/webm"
    elif mp4_path.is_file():
        recording_path, media_type = mp4_path, "video/mp4"
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recording for this meeting",
        )
    return FileResponse(
        path=str(recording_path),
        media_type=media_type,
        filename=recording_path.name,
    )


# ---------------------------------------------------------------------------
# POST /{meeting_id}/reprocess  — manually re-trigger processing
# ---------------------------------------------------------------------------


@router.post("/{meeting_id}/reprocess", response_model=ProcessingStatusResponse)
async def reprocess_meeting(
    meeting_id: str,
    provider: Optional[str] = None,
    user: User = Depends(get_current_user_with_db),
    db: AsyncSession = Depends(get_async_db_session),
) -> ProcessingStatusResponse:
    """Manually re-trigger diarization + speaker identification.

    Optionally override the diarization provider (``deepgram`` or ``assemblyai``).
    """
    meeting_dir = await _resolve_meeting_dir(db, user, meeting_id)

    recording_path = meeting_dir / "recording.webm"
    if not recording_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recording available for this meeting — cannot process",
        )

    meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user.id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    await MeetingProcessingRepository.mark_pending(db, meeting.id)
    await db.commit()

    scheduled = schedule_processing(
        meeting_dir,
        meeting_id=meeting.id,
        provider=provider,
    )
    current = read_status(meeting_dir)

    return ProcessingStatusResponse(
        meetingId=meeting_id,
        status=current.get("status", "pending") if scheduled else "already_processing",
        updatedAt=current.get("updatedAt"),
    )
