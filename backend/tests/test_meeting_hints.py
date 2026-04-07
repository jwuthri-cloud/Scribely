"""Unit tests for calendar / metadata transcription hints."""

from app.database.models.calendar import ParticipantResponseStatus
from app.services.meeting_hints import (
    build_word_boost_tokens,
    expected_speaker_count_from_participants,
    hints_from_transcript_metadata,
)


class _P:
    def __init__(self, status: ParticipantResponseStatus = ParticipantResponseStatus.ACCEPTED):
        self.response_status = status


def test_expected_speaker_count_excludes_declined() -> None:
    parts = [
        _P(ParticipantResponseStatus.ACCEPTED),
        _P(ParticipantResponseStatus.DECLINED),
        _P(ParticipantResponseStatus.TENTATIVE),
    ]
    assert expected_speaker_count_from_participants(parts) == 2


def test_hints_from_metadata_expected_speakers() -> None:
    h = hints_from_transcript_metadata(
        {"expectedSpeakers": 4, "participantNames": ["Ada Lovelace"]}
    )
    assert h.speakers_expected == 4
    assert "Ada Lovelace" in h.participant_names


def test_build_word_boost_dedupes_and_caps() -> None:
    boost = build_word_boost_tokens(
        ("Foo Bar", "foo bar", "Baz Qux"),
    )
    assert "Foo" in boost
    assert boost.count("Foo") == 1
    assert len(boost) <= 15
