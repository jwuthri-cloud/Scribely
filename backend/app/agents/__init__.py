"""Agents module for Scribely."""

from app.agents.agents.assistant import AssistantAgent
from app.agents.agents.speaker_identifier import SpeakerIdentifierAgent

# Backward-compat alias
CustomerSupportAgent = AssistantAgent

__all__ = [
    "AssistantAgent",
    "CustomerSupportAgent",
    "SpeakerIdentifierAgent",
]
