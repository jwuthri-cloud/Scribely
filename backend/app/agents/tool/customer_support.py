"""Backward-compatibility re-export. Use app.agents.tool.tools instead."""
from app.agents.tool.tools import build_tools  # noqa: F401

__all__ = ["build_tools"]
