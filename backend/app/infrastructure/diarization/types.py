"""Shared types for diarization output."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DiarizationHints:
    """Optional hints from calendar participants or transcript metadata."""

    speakers_expected: int | None = None
    word_boost: tuple[str, ...] = ()


@dataclass
class DiarizedUtterance:
    speaker: str        # "Speaker 0", "Speaker 1", …
    text: str
    start_ms: int
    end_ms: int
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
