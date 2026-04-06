"""Structured output module."""

from app.agents.structured_output.assistant import AssistantResponse

# Backward-compat alias
CustomerSupportResponse = AssistantResponse

__all__ = [
    "AssistantResponse",
    "CustomerSupportResponse",
]
