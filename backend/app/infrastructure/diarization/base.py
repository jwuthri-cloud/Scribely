"""Abstract base class for diarization providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from .types import DiarizedUtterance


class BaseDiarizer(ABC):
    """Provider-agnostic interface for speaker diarization."""

    @abstractmethod
    async def diarize(self, audio_path: Path) -> list[DiarizedUtterance]:
        """Run diarization on *audio_path* and return normalised utterances.

        All implementations must normalise speaker labels to
        ``Speaker 0``, ``Speaker 1``, etc.
        """
