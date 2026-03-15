"""Thin service wrapper around the SpeakerIdentifierAgent.

Keeps the ``identify_speakers()`` function signature that the meeting
processor already calls, while delegating all LLM logic to the agent.
"""

from __future__ import annotations

from pathlib import Path

from app.agents.agents.speaker_identifier import SpeakerIdentifierAgent
from app.config import get_settings
from app.services.diarization import DiarizedUtterance
from app.utils.logging import get_logger

logger = get_logger("speaker_identifier")


async def identify_speakers(
    speaker_frames: dict[str, list[Path]],
    utterances: list[DiarizedUtterance],
    session_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, str]:
    """Use LLM vision to map anonymous speaker labels to real names.

    Returns ``{ "Speaker 0": "Alice Chen", "Speaker 1": "Bob", … }``.
    Speakers that cannot be identified keep their original label.
    """
    settings = get_settings()

    if not settings.openrouter_api_key:
        logger.warning("OPENROUTER_API_KEY not set — skipping speaker identification")
        return {s: s for s in speaker_frames}

    agent = SpeakerIdentifierAgent()
    return await agent.identify(
        speaker_frames,
        utterances,
        session_id=session_id,
        user_id=user_id,
    )
