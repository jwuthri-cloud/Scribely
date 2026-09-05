"""Extract audio from WebM recordings using ffmpeg."""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from app.utils.logging import get_logger

logger = get_logger("audio_extractor")


class FfmpegAudioExtractor:
    """Converts video recordings to 16 kHz mono WAV using ffmpeg."""

    def __init__(self) -> None:
        self._check_ffmpeg()

    @staticmethod
    def _check_ffmpeg() -> str:
        path = shutil.which("ffmpeg")
        if not path:
            raise RuntimeError(
                "ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`) "
                "before using diarization features."
            )
        return path

    async def extract(self, webm_path: Path) -> Path:
        """Convert a WebM recording to 16 kHz mono WAV suitable for diarization APIs.

        The output file is written next to the input as ``audio.wav``.
        If the file already exists it is returned immediately (idempotent).
        """
        output_path = webm_path.parent / "audio.wav"
        if output_path.exists():
            logger.info(f"Audio already extracted: {output_path}")
            return output_path

        cmd = [
            "ffmpeg",
            "-i",
            str(webm_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-y",
            str(output_path),
        ]

        logger.info(f"Extracting audio: {webm_path} → {output_path}")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace").strip()
            raise RuntimeError(
                f"ffmpeg audio extraction failed (rc={proc.returncode}): {err_msg}"
            )

        size_mb = output_path.stat().st_size / (1024 * 1024)
        logger.info(f"Audio extracted: {size_mb:.1f} MB → {output_path}")
        return output_path
