"""Backward-compatibility re-export. Use app.agents.structured_output.assistant instead."""
from app.agents.structured_output.assistant import AssistantResponse as CustomerSupportResponse  # noqa: F401

__all__ = ["CustomerSupportResponse"]
