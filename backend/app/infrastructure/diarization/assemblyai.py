"""AssemblyAI Universal-2 diarization provider."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.utils.logging import get_logger

from .base import BaseDiarizer
from .types import DiarizedUtterance

logger = get_logger("diarization.assemblyai")


class AssemblyAIDiarizer(BaseDiarizer):
    """Speaker diarization via AssemblyAI Universal-2."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("ASSEMBLYAI_API_KEY is not configured")
        self._api_key = api_key

    async def diarize(self, audio_path: Path) -> list[DiarizedUtterance]:
        import assemblyai as aai

        logger.info(f"Diarizing with AssemblyAI Universal-2: {audio_path}")

        aai.settings.api_key = self._api_key

        config = aai.TranscriptionConfig(
            speaker_labels=True,
            speech_models=["universal-3-pro", "universal-2"],
            language_detection=True,
            speakers_expected=None,
        )
        transcriber = aai.Transcriber(config=config)

        # assemblyai SDK is synchronous — run in a thread so we don't block the loop
        transcript = await asyncio.to_thread(transcriber.transcribe, str(audio_path))

        if transcript.status == aai.TranscriptStatus.error:
            raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

        raw_utterances = transcript.utterances or []

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
