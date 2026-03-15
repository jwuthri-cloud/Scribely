"""Extract video frames at specific timestamps using ffmpeg.

For each speaker detected by diarization, we pick N utterances spread evenly
across the meeting and grab a single JPEG frame at the midpoint of each
utterance.  This gives the LLM vision model a representative set of screenshots
showing who is speaking at different points in the call.
"""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from app.services.diarization import DiarizedUtterance
from app.utils.logging import get_logger

logger = get_logger("frame_extractor")


def _check_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg not found on PATH")
    return path


def _pick_spread_indices(total: int, count: int) -> list[int]:
    """Return *count* indices spread evenly across ``range(total)``."""
    if total <= count:
        return list(range(total))
    step = total / count
    return [int(i * step) for i in range(count)]


async def _extract_frame(webm_path: Path, timestamp_sec: float, output_path: Path) -> bool:
    """Extract a single JPEG frame at *timestamp_sec* from *webm_path*."""
    cmd = [
        "ffmpeg",
        "-ss", f"{timestamp_sec:.3f}",
        "-i", str(webm_path),
        "-frames:v", "1",
        "-q:v", "2",
        "-y",
        str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    return proc.returncode == 0 and output_path.exists()


async def extract_speaker_frames(
    webm_path: Path,
    utterances: list[DiarizedUtterance],
    frames_per_speaker: int = 10,
) -> dict[str, list[Path]]:
    """Extract representative video frames for each speaker.

    Returns a mapping ``{ "Speaker 0": [frame0.jpg, …], … }``.
    Frames are stored in ``{webm_dir}/frames/``.
    """
    _check_ffmpeg()

    frames_dir = webm_path.parent / "frames"
    frames_dir.mkdir(exist_ok=True)

    # Group utterances by speaker
    by_speaker: dict[str, list[DiarizedUtterance]] = {}
    for utt in utterances:
        by_speaker.setdefault(utt.speaker, []).append(utt)

    result: dict[str, list[Path]] = {}

    for speaker, speaker_utts in by_speaker.items():
        indices = _pick_spread_indices(len(speaker_utts), frames_per_speaker)
        selected = [speaker_utts[i] for i in indices]

        frames: list[Path] = []
        for idx, utt in enumerate(selected):
            midpoint_sec = (utt.start_ms + utt.end_ms) / 2 / 1000.0
            safe_name = speaker.replace(" ", "_").lower()
            out_path = frames_dir / f"{safe_name}_frame_{idx:02d}.jpg"

            ok = await _extract_frame(webm_path, midpoint_sec, out_path)
            if ok:
                frames.append(out_path)
            else:
                logger.warning(
                    f"Failed to extract frame for {speaker} at {midpoint_sec:.1f}s"
                )

        result[speaker] = frames
        logger.info(f"{speaker}: extracted {len(frames)}/{len(indices)} frames")

    return result
