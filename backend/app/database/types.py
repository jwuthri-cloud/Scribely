"""
SQLAlchemy column types — prefer plain VARCHAR over PostgreSQL ENUM types.
"""

from __future__ import annotations

import enum

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator


class VarcharEnum(TypeDecorator):
    """Store status-like values as VARCHAR (no DB enum types).

    Accepts str or str-based :class:`enum.Enum` on write; returns plain ``str`` on read.
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int) -> None:
        super().__init__(length)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, enum.Enum):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(value)
