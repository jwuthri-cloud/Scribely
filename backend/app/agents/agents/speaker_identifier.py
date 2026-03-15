"""Speaker identification agent using LLM vision via OpenRouter."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.prompt.speaker_identifier import SYSTEM_PROMPT
from app.agents.structured_output.speaker_identifier import (
    SpeakerIdentificationResponse,
    SpeakerMapping,
)
from app.config import get_settings
from app.infrastructure.circuit_breaker import get_llm_circuit_breaker
from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.services.diarization import DiarizedUtterance
from app.utils.logging import get_logger

logger = get_logger("speaker_identifier_agent")

MAX_SAMPLE_UTTERANCES = 5


class SpeakerIdentifierAgent:
    """Identifies real speaker names from meeting video frames + transcript context.

    Uses a vision-capable model via OpenRouter to analyse screenshots taken at
    moments when each anonymous speaker was talking, combined with sample
    utterances, to produce a ``Speaker N → Real Name`` mapping.
    """

    def __init__(
        self,
        llm_provider: Optional[OpenRouterProvider] = None,
        model_name: Optional[str] = None,
        temperature: float = 0.1,
    ):
        settings = get_settings()
        self.llm_provider = llm_provider or OpenRouterProvider()
        self.model_name = model_name or settings.speaker_id_vision_model
        self.temperature = temperature

        self.llm = self.llm_provider.get_llm(
            model_name=self.model_name,
            temperature=self.temperature,
        )

        logger.info(f"[SpeakerIdentifierAgent] Initialized with model: {self.model_name}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def identify(
        self,
        speaker_frames: dict[str, list[Path]],
        utterances: list[DiarizedUtterance],
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> dict[str, str]:
        """Map anonymous speaker labels to real names.

        Returns ``{ "Speaker 0": "Alice Chen", … }``.
        Speakers that cannot be identified keep their original label.
        """
        total_frames = sum(len(f) for f in speaker_frames.values())
        if total_frames == 0:
            logger.warning("No frames available — skipping speaker identification")
            return {s: s for s in speaker_frames}

        messages = self._build_messages(speaker_frames, utterances)

        langfuse_config = get_langfuse_config(
            session_id=session_id,
            user_id=user_id,
            tags=["speaker-identification", "vision"],
            metadata={
                "agent_type": "speaker_identifier",
                "model": self.model_name,
                "total_frames": str(total_frames),
                "speaker_count": str(len(speaker_frames)),
            },
            run_name="speaker-identification",
        )

        logger.info(
            f"[SpeakerIdentifierAgent] Identifying {len(speaker_frames)} speakers "
            f"({total_frames} frames) via {self.model_name}"
        )

        circuit_breaker = get_llm_circuit_breaker()

        async def invoke_llm() -> SpeakerIdentificationResponse:
            structured_llm = self.llm.with_structured_output(SpeakerIdentificationResponse)
            return await structured_llm.ainvoke(messages, config=langfuse_config)

        try:
            response: SpeakerIdentificationResponse = await circuit_breaker.call(invoke_llm)
        except Exception as e:
            logger.error(f"[SpeakerIdentifierAgent] LLM call failed: {e}")
            return {s: s for s in speaker_frames}

        mapping = response.to_map()

        # Ensure every speaker has an entry
        for speaker in speaker_frames:
            if speaker not in mapping or not mapping[speaker]:
                mapping[speaker] = speaker

        logger.info(f"[SpeakerIdentifierAgent] Speaker mapping: {mapping}")
        if response.reasoning:
            logger.info(f"[SpeakerIdentifierAgent] Reasoning: {response.reasoning}")

        return mapping

    # ------------------------------------------------------------------
    # Message building
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        speaker_frames: dict[str, list[Path]],
        utterances: list[DiarizedUtterance],
    ) -> list[SystemMessage | HumanMessage]:
        content_parts: list[dict[str, Any]] = []

        for speaker, frames in speaker_frames.items():
            samples = self._pick_sample_utterances(utterances, speaker)
            sample_text = (
                "\n".join(f'  - "{s}"' for s in samples)
                if samples
                else "  (no clear utterances)"
            )

            content_parts.append({
                "type": "text",
                "text": (
                    f"\n--- {speaker} ---\n"
                    f"Sample utterances:\n{sample_text}\n"
                    f"Screenshots ({len(frames)} frames while this speaker was talking):"
                ),
            })

            for frame_path in frames:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {
                        "url": _image_to_data_url(frame_path),
                        "detail": "low",
                    },
                })

        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=content_parts),
        ]

    @staticmethod
    def _pick_sample_utterances(
        utterances: list[DiarizedUtterance],
        speaker: str,
        count: int = MAX_SAMPLE_UTTERANCES,
    ) -> list[str]:
        speaker_utts = [u for u in utterances if u.speaker == speaker and len(u.text) > 10]
        speaker_utts.sort(key=lambda u: len(u.text), reverse=True)
        return [u.text for u in speaker_utts[:count]]


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _image_to_data_url(path: Path) -> str:
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode()
    return f"data:image/jpeg;base64,{b64}"
