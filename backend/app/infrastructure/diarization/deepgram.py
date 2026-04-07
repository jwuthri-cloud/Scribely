"""Deepgram Nova-3 diarization provider."""

from __future__ import annotations

from pathlib import Path

from app.utils.logging import get_logger

from .base import BaseDiarizer
from .types import DiarizedUtterance, DiarizationHints

logger = get_logger("diarization.deepgram")


class DeepgramDiarizer(BaseDiarizer):
    """Speaker diarization via Deepgram Nova-3."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("DEEPGRAM_API_KEY is not configured")
        self._api_key = api_key

    async def diarize(
        self,
        audio_path: Path,
        *,
        hints: DiarizationHints | None = None,
    ) -> list[DiarizedUtterance]:
        from deepgram import DeepgramClient

        logger.info(f"Diarizing with Deepgram Nova-3: {audio_path}")

        client = DeepgramClient(api_key=self._api_key)

        with open(audio_path, "rb") as f:
            buffer_data = f.read()

        keyterm: list[str] | None = None
        if hints and hints.word_boost:
            keyterm = list(hints.word_boost)
            logger.info("Deepgram keyterm boost (%s terms)", len(keyterm))

        response = client.listen.v1.media.transcribe_file(
            request=buffer_data,
            model="nova-3",
            diarize=True,
            punctuate=True,
            utterances=True,
            smart_format=True,
            keyterm=keyterm,
        )

        raw_utterances = (
            response.results.utterances
            if response.results and response.results.utterances
            else []
        )

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
