"""Resolve calendar / transcript metadata into diarization and speaker-ID hints."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable

from app.database.models.calendar import CalendarEventParticipant, ParticipantResponseStatus
from app.database.repositories.calendar import CalendarRepository
from app.database.repositories.meeting import MeetingRepository
from app.database.session import get_async_session
from app.utils.logging import get_logger

logger = get_logger("meeting_hints")

# Align with product plan: very large invite lists are a poor proxy for speakers.
MAX_SPEAKERS_EXPECTED_HINT = 20
MAX_PARTICIPANT_NAMES = 40
MAX_WORD_BOOST_TERMS = 15


@dataclass(frozen=True)
class MeetingProcessingHints:
    """Hints derived from calendar participants and/or transcript metadata."""

    speakers_expected: int | None
    participant_names: tuple[str, ...]
    word_boost: tuple[str, ...]


EMPTY_HINTS = MeetingProcessingHints(None, (), ())


def expected_speaker_count_from_participants(
    participants: Iterable[CalendarEventParticipant],
) -> int | None:
    active = [
        p
        for p in participants
        if p.response_status != ParticipantResponseStatus.DECLINED
    ]
    if not active:
        return None
    return min(len(active), MAX_SPEAKERS_EXPECTED_HINT)


def participant_labels_from_rows(
    participants: Iterable[CalendarEventParticipant],
) -> tuple[str, ...]:
    out: list[str] = []
    seen: set[str] = set()
    for p in participants:
        if p.response_status == ParticipantResponseStatus.DECLINED:
            continue
        email = (p.email or "").strip()
        label = (p.display_name or "").strip()
        if not label and email:
            label = email.split("@", 1)[0].replace(".", " ").strip() or email
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
    return tuple(out[:MAX_PARTICIPANT_NAMES])


def build_word_boost_tokens(participant_labels: Iterable[str]) -> tuple[str, ...]:
    """Short tokens (e.g. surnames) for ASR boosting; capped for privacy and API limits."""
    seen: set[str] = set()
    out: list[str] = []
    for label in participant_labels:
        for token in re.split(r"[\s@,]+", label):
            t = token.strip().strip(".,;:")
            if len(t) < 3:
                continue
            lk = t.lower()
            if lk in seen:
                continue
            seen.add(lk)
            out.append(t)
            if len(out) >= MAX_WORD_BOOST_TERMS:
                return tuple(out)
    return tuple(out)


def hints_from_calendar_participants(
    participants: list[CalendarEventParticipant],
) -> MeetingProcessingHints:
    labels = participant_labels_from_rows(participants)
    n = expected_speaker_count_from_participants(participants)
    boost = build_word_boost_tokens(labels)
    return MeetingProcessingHints(
        speakers_expected=n,
        participant_names=labels,
        word_boost=boost,
    )


def hints_from_transcript_metadata(meta: dict[str, Any]) -> MeetingProcessingHints:
    """Fallback when the client embeds hints in ``transcript.json`` metadata."""
    exp = meta.get("expectedSpeakers")
    n: int | None = None
    if isinstance(exp, int) and exp >= 1:
        n = min(exp, MAX_SPEAKERS_EXPECTED_HINT)
    elif isinstance(exp, float) and exp >= 1:
        n = min(int(exp), MAX_SPEAKERS_EXPECTED_HINT)

    raw = meta.get("participantNames")
    names_list: list[str] = []
    if isinstance(raw, list):
        names_list = [str(x).strip() for x in raw if str(x).strip()]

    # Dedupe preserving order
    dedup: list[str] = []
    seen: set[str] = set()
    for name in names_list:
        k = name.lower()
        if k in seen:
            continue
        seen.add(k)
        dedup.append(name)

    names = tuple(dedup[:MAX_PARTICIPANT_NAMES])
    boost = build_word_boost_tokens(names)
    return MeetingProcessingHints(speakers_expected=n, participant_names=names, word_boost=boost)


async def load_meeting_processing_hints(
    meeting_id: str | None,
    original_transcript: dict[str, Any],
) -> MeetingProcessingHints:
    """Load hints from DB (calendar) when linked; otherwise from transcript metadata."""
    meta: dict[str, Any] = {}
    if isinstance(original_transcript, dict):
        raw_meta = original_transcript.get("metadata")
        if isinstance(raw_meta, dict):
            meta = raw_meta

    meta_hints = hints_from_transcript_metadata(meta)

    if not meeting_id:
        if meta_hints.speakers_expected or meta_hints.participant_names:
            logger.info(
                "Using transcript metadata hints: expected=%s names=%s",
                meta_hints.speakers_expected,
                len(meta_hints.participant_names),
            )
        return meta_hints

    try:
        async with get_async_session() as db:
            row = await MeetingRepository.get_by_id(db, meeting_id)
            if not row or not row.calendar_event_id:
                return meta_hints

            ev = await CalendarRepository.get_event_by_id(
                db,
                row.calendar_event_id,
                row.user_id,
                with_participants=True,
            )
            if not ev or not ev.participants:
                logger.warning(
                    "Meeting %s has calendar_event_id=%s but event or participants missing",
                    meeting_id,
                    row.calendar_event_id,
                )
                return meta_hints

            db_hints = hints_from_calendar_participants(list(ev.participants))
            logger.info(
                "Calendar hints for meeting %s: expected=%s participants=%s",
                meeting_id,
                db_hints.speakers_expected,
                len(db_hints.participant_names),
            )
            return db_hints
    except Exception as e:
        logger.warning("Failed to load calendar hints for meeting %s: %s", meeting_id, e)
        return meta_hints
