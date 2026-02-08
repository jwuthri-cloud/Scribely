"""
User-related Pydantic models for API serialization.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, validator


class UserStatusEnum(str, Enum):
    """User status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


# Request models
# Note: User registration and login are handled by Clerk authentication
# Users are created automatically when they authenticate via Clerk


class UserUpdateRequest(BaseModel):
    """User update request model."""
    full_name: Optional[str] = Field(None, max_length=100, description="Full name")
    bio: Optional[str] = Field(None, max_length=500, description="User biography")
    preferences: Optional[Dict[str, Any]] = Field(None, description="User preferences")

    class Config:
        json_schema_extra = {
            "example": {
                "full_name": "John Smith",
                "bio": "Software developer and AI enthusiast",
                "preferences": {
                    "theme": "dark",
                    "language": "en",
                    "notifications": True
                }
            }
        }


# Response models
class UserProfile(BaseModel):
    """User profile response model."""
    id: str = Field(..., description="User ID")
    clerk_id: str = Field(..., description="Clerk user ID")
    username: Optional[str] = Field(None, description="Username")
    email: Optional[str] = Field(None, description="Email address")
    full_name: Optional[str] = Field(None, description="Full name")
    bio: Optional[str] = Field(None, description="User biography")
    is_active: bool = Field(..., description="Whether user is active (computed from status)")
    is_superuser: bool = Field(False, description="Whether user has admin privileges")
    status: UserStatusEnum = Field(..., description="User status")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    last_login_at: Optional[datetime] = Field(None, description="Last login timestamp")

    class Config:
        from_attributes = True  # For SQLAlchemy model conversion
        json_schema_extra = {
            "example": {
                "id": "uuid-here",
                "clerk_id": "user_2abc123xyz",
                "username": "johndoe",
                "email": "john.doe@example.com",
                "full_name": "John Doe",
                "bio": "Software developer passionate about AI",
                "is_active": True,
                "is_superuser": False,
                "status": "active",
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-15T10:30:00Z",
                "last_login_at": "2024-01-15T09:00:00Z"
            }
        }


class UserPublicProfile(BaseModel):
    """Public user profile (limited information)."""
    id: str = Field(..., description="User ID")
    clerk_id: str = Field(..., description="Clerk user ID")
    username: Optional[str] = Field(None, description="Username")
    full_name: Optional[str] = Field(None, description="Full name")
    bio: Optional[str] = Field(None, description="User biography")
    created_at: datetime = Field(..., description="Account creation timestamp")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "uuid-here",
                "clerk_id": "user_2abc123xyz",
                "username": "johndoe",
                "full_name": "John Doe",
                "bio": "Software developer passionate about AI",
                "created_at": "2024-01-01T12:00:00Z"
            }
        }


class UserStats(BaseModel):
    """User statistics response model."""
    user_id: str = Field(..., description="User ID")
    clerk_id: str = Field(..., description="Clerk user ID")
    total_sessions: int = Field(0, description="Total chat sessions created")
    total_messages: int = Field(0, description="Total messages sent")
    last_active_at: Optional[datetime] = Field(None, description="Last activity timestamp")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "user_id": "uuid-here",
                "clerk_id": "user_2abc123xyz",
                "total_sessions": 12,
                "total_messages": 89,
                "last_active_at": "2024-01-15T09:00:00Z"
            }
        }


# List models
class UserListItem(BaseModel):
    """User list item for admin views."""
    id: str = Field(..., description="User ID")
    clerk_id: str = Field(..., description="Clerk user ID")
    username: Optional[str] = Field(None, description="Username")
    email: Optional[str] = Field(None, description="Email address")
    full_name: Optional[str] = Field(None, description="Full name")
    is_active: bool = Field(..., description="Whether user is active")
    status: UserStatusEnum = Field(..., description="User status")
    created_at: datetime = Field(..., description="Account creation timestamp")
    last_login_at: Optional[datetime] = Field(None, description="Last login timestamp")

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Paginated user list response."""
    users: List[UserListItem] = Field(..., description="List of users")
    total: int = Field(..., description="Total number of users")
    limit: int = Field(..., description="Items per page")
    offset: int = Field(..., description="Items skipped")
    has_more: bool = Field(..., description="Whether there are more items")

    class Config:
        json_schema_extra = {
            "example": {
                "users": [
                    {
                        "id": "uuid-here",
                        "clerk_id": "user_2abc123xyz",
                        "username": "johndoe",
                        "email": "john.doe@example.com",
                        "full_name": "John Doe",
                        "is_active": True,
                        "status": "active",
                        "created_at": "2024-01-01T12:00:00Z",
                        "last_login_at": "2024-01-15T09:00:00Z"
                    }
                ],
                "total": 1,
                "limit": 50,
                "offset": 0,
                "has_more": False
            }
        }
