"""Agents module."""

from app.agents.agents.assistant import AssistantAgent

# Backward-compat alias
CustomerSupportAgent = AssistantAgent

__all__ = [
    "AssistantAgent",
    "CustomerSupportAgent",
]
