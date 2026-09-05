"""Backward-compatibility re-export. Use app.agents.prompt.assistant instead."""

from app.agents.prompt.assistant import SYSTEM_PROMPT  # noqa: F401

__all__ = ["SYSTEM_PROMPT"]
