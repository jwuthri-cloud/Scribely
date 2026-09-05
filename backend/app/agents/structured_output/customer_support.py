"""Backward-compatibility re-export. Use app.agents.structured_output.assistant instead."""

from app.agents.structured_output.assistant import (  # noqa: F401
    AssistantResponse as CustomerSupportResponse,
)

__all__ = ["CustomerSupportResponse"]
