"""Audio extraction from video recordings."""

from __future__ import annotations

from pathlib import Path

from .ffmpeg import FfmpegAudioExtractor

__all__ = ["FfmpegAudioExtractor", "extract_audio"]


async def extract_audio(webm_path: Path) -> Path:
    """Convert a WebM recording to 16 kHz mono WAV suitable for diarization APIs."""
    return await FfmpegAudioExtractor().extract(webm_path)
