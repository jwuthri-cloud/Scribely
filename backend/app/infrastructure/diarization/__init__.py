"""Provider-agnostic speaker diarization.

Supports Deepgram Nova-3 and AssemblyAI Universal-2.  Both normalise their
output to a flat list of ``DiarizedUtterance`` objects with consistent
``Speaker 0 / 1 / …`` labels.
"""

from __future__ import annotations

from pathlib import Path

from app.config import get_settings

from .assemblyai import AssemblyAIDiarizer
from .base import BaseDiarizer
from .deepgram import DeepgramDiarizer
from .types import DiarizedUtterance

__all__ = [
    "AssemblyAIDiarizer",
    "BaseDiarizer",
    "DeepgramDiarizer",
    "DiarizedUtterance",
    "diarize",
    "get_diarizer",
]


def get_diarizer(provider: str | None = None) -> BaseDiarizer:
    """Return a diarizer instance for the given provider name."""
    settings = get_settings()
    provider = provider or settings.diarization_provider

    if provider == "deepgram":
        return DeepgramDiarizer(api_key=settings.deepgram_api_key)
    elif provider == "assemblyai":
        return AssemblyAIDiarizer(api_key=settings.assemblyai_api_key)
    else:
        raise ValueError(f"Unknown diarization provider: {provider!r}")


async def diarize(audio_path: Path, provider: str | None = None) -> list[DiarizedUtterance]:
    """Run diarization on *audio_path* using the configured provider.

    ``provider`` defaults to ``settings.diarization_provider`` when not given.
    """
    return await get_diarizer(provider).diarize(audio_path)
