"""Video frame extraction for speaker identification."""

from __future__ import annotations

from pathlib import Path

from app.infrastructure.diarization import DiarizedUtterance

from .ffmpeg import FfmpegFrameExtractor

__all__ = ["FfmpegFrameExtractor", "extract_speaker_frames"]


async def extract_speaker_frames(
    webm_path: Path,
    utterances: list[DiarizedUtterance],
    frames_per_speaker: int = 10,
) -> dict[str, list[Path]]:
    """Extract representative video frames for each speaker."""
    return await FfmpegFrameExtractor().extract_speaker_frames(
        webm_path, utterances, frames_per_speaker
    )
