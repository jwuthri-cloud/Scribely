"""Provider-agnostic speaker diarization.

Supports Deepgram Nova-3 and AssemblyAI Universal-2.  Both normalise their
output to a flat list of ``DiarizedUtterance`` objects with consistent
``Speaker 0 / 1 / …`` labels.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("diarization")


@dataclass
class DiarizedUtterance:
    speaker: str        # "Speaker 0", "Speaker 1", …
    text: str
    start_ms: int
    end_ms: int
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def diarize(audio_path: Path, provider: str | None = None) -> list[DiarizedUtterance]:
    """Run diarization on *audio_path* using the configured provider.

    ``provider`` defaults to ``settings.diarization_provider`` when not given.
    """
    settings = get_settings()
    provider = provider or settings.diarization_provider

    if provider == "deepgram":
        return await _diarize_deepgram(audio_path, settings.deepgram_api_key)
    elif provider == "assemblyai":
        return await _diarize_assemblyai(audio_path, settings.assemblyai_api_key)
    else:
        raise ValueError(f"Unknown diarization provider: {provider!r}")


# ---------------------------------------------------------------------------
# Deepgram Nova-3
# ---------------------------------------------------------------------------

async def _diarize_deepgram(audio_path: Path, api_key: str) -> list[DiarizedUtterance]:
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY is not configured")

    from deepgram import DeepgramClient

    logger.info(f"Diarizing with Deepgram Nova-3: {audio_path}")

    client = DeepgramClient(api_key=api_key)

    with open(audio_path, "rb") as f:
        buffer_data = f.read()

    response = client.listen.v1.media.transcribe_file(
        request=buffer_data,
        model="nova-3",
        diarize=True,
        punctuate=True,
        utterances=True,
        smart_format=True,
    )

    raw_utterances = (
        response.results.utterances
        if response.results and response.results.utterances
        else []
    )

    # Build a stable speaker-index map so labels are "Speaker 0", "Speaker 1", …
    speaker_map: dict[int, str] = {}
    utterances: list[DiarizedUtterance] = []

    for utt in raw_utterances:
        sid = utt.speaker
        if sid not in speaker_map:
            speaker_map[sid] = f"Speaker {len(speaker_map)}"

        utterances.append(
            DiarizedUtterance(
                speaker=speaker_map[sid],
                text=utt.transcript.strip(),
                start_ms=int(utt.start * 1000),
                end_ms=int(utt.end * 1000),
                confidence=utt.confidence if utt.confidence is not None else 0.0,
            )
        )

    logger.info(
        f"Deepgram: {len(utterances)} utterances, "
        f"{len(speaker_map)} speakers detected"
    )
    return utterances


# ---------------------------------------------------------------------------
# AssemblyAI Universal-2
# ---------------------------------------------------------------------------

async def _diarize_assemblyai(audio_path: Path, api_key: str) -> list[DiarizedUtterance]:
    if not api_key:
        raise RuntimeError("ASSEMBLYAI_API_KEY is not configured")

    import assemblyai as aai

    logger.info(f"Diarizing with AssemblyAI Universal-2: {audio_path}")

    aai.settings.api_key = api_key

    config = aai.TranscriptionConfig(speaker_labels=True, speech_models=["universal-3-pro", "universal-2"], language_detection=True, speakers_expected=None)
    transcriber = aai.Transcriber(config=config)

    # assemblyai SDK is synchronous — run in a thread so we don't block the loop
    import asyncio
    transcript = await asyncio.to_thread(transcriber.transcribe, str(audio_path))

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

    raw_utterances = transcript.utterances or []

    # Normalise speaker labels: AssemblyAI uses "A", "B", … → "Speaker 0", …
    speaker_map: dict[str, str] = {}
    utterances: list[DiarizedUtterance] = []

    for utt in raw_utterances:
        sid = utt.speaker
        if sid not in speaker_map:
            speaker_map[sid] = f"Speaker {len(speaker_map)}"

        utterances.append(
            DiarizedUtterance(
                speaker=speaker_map[sid],
                text=utt.text.strip(),
                start_ms=utt.start,
                end_ms=utt.end,
                confidence=utt.confidence if utt.confidence is not None else 0.0,
            )
        )

    logger.info(
        f"AssemblyAI: {len(utterances)} utterances, "
        f"{len(speaker_map)} speakers detected"
    )
    return utterances
