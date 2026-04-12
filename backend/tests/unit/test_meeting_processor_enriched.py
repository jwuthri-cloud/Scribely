"""Tests for meeting_processor merge helpers."""

import json
from pathlib import Path

from app.infrastructure.diarization.types import DiarizedUtterance
from app.services.meeting_processor import _build_enriched, _load_original_transcript


def test_load_original_transcript_missing_returns_empty(tmp_path: Path) -> None:
    assert _load_original_transcript(tmp_path / "nope.json") == {}


def test_load_original_transcript_valid(tmp_path: Path) -> None:
    p = tmp_path / "transcript.json"
    p.write_text(json.dumps({"entries": [{"t": 1}], "createdAt": "2020-01-01T00:00:00Z"}))
    data = _load_original_transcript(p)
    assert data["entries"] == [{"t": 1}]


def test_build_enriched_merges_speakers_and_preserves_entries() -> None:
    original = {
        "createdAt": "2024-01-01T00:00:00Z",
        "entries": [{"speaker": "You", "text": "Hi"}],
        "summary": {},
    }
    utterances = [
        DiarizedUtterance(
            speaker="SPEAKER_00",
            text="Hello team",
            start_ms=0,
            end_ms=500,
            confidence=0.9,
        )
    ]
    enriched = _build_enriched(
        original,
        "deepgram",
        {"SPEAKER_00": "Alice"},
        utterances,
    )
    assert enriched["version"] == 2
    assert enriched["entries"] == original["entries"]
    d = enriched["diarization"]
    assert d["provider"] == "deepgram"
    assert d["speakerMap"] == {"SPEAKER_00": "Alice"}
    assert d["utterances"][0]["speaker"] == "Alice"
    assert d["utterances"][0]["originalLabel"] == "SPEAKER_00"
    assert "speakers" in d
