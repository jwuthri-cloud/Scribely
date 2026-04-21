"""
Database repositories package for Scribely.
"""

from .contact import ContactRepository
from .deal import DealRepository
from .knowledge import ContactKnowledgeRepository
from .meeting import MeetingRepository
from .user import UserRepository

__all__ = [
    "ContactKnowledgeRepository",
    "ContactRepository",
    "DealRepository",
    "MeetingRepository",
    "UserRepository",
]
