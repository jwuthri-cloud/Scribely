"""
User model for Scribely.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import String

from ..base import Base


class UserStatusEnum(str, enum.Enum):
    """User account status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class User(Base):
    """User account model."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    clerk_id = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    username = Column(String(100), unique=True, index=True, nullable=True)
    full_name = Column(String(255), nullable=True)
    status = Column(SQLEnum(UserStatusEnum), default=UserStatusEnum.ACTIVE)
    is_superuser = Column(Boolean, default=False)

    role = Column(String(50), default="user")

    @property
    def is_active(self) -> bool:
        """Check if user is active based on status."""
        return self.status == UserStatusEnum.ACTIVE

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    preferences = Column(JSON, default={})
    extra_metadata = Column(JSON, default={})

    def __repr__(self):
        return f"<User(id={self.id}, clerk_id={self.clerk_id}, email={self.email}, status={self.status})>"
