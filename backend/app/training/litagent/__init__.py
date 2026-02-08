"""LitAgent wrappers for LangChain agents.

This module provides base classes for wrapping existing LangChain agents
into trainable LitAgents compatible with agent-lightning.
"""

from app.training.litagent.base import LitLangChainAgent
from app.training.litagent.customer_support import LitCustomerSupportAgent

__all__ = [
    "LitLangChainAgent",
    "LitCustomerSupportAgent",
]
