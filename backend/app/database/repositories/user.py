"""
User repository for AssistMe.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...utils.logging import get_logger
from ..models.user import User

logger = get_logger("user_repository")


class UserRepository:
    """Repository for User model operations."""

    @staticmethod
    async def create(db: AsyncSession, clerk_id: str, email: str = None, username: str = None, full_name: str = None, **kwargs) -> User:
        """Create a new user from Clerk authentication."""
        user = User(
            clerk_id=clerk_id,
            email=email,
            username=username,
            full_name=full_name,
            **kwargs
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info(f"Created user: {user.id} (clerk_id: {clerk_id})")
        return user

    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
        """Get user by ID."""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """Get user by email."""
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """Get user by username."""
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_clerk_id(db: AsyncSession, clerk_id: str) -> Optional[User]:
        """Get user by Clerk ID."""
        result = await db.execute(select(User).where(User.clerk_id == clerk_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_all(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all users with pagination."""
        result = await db.execute(select(User).offset(skip).limit(limit))
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, user_id: str, **kwargs) -> Optional[User]:
        """Update user."""
        user = await UserRepository.get_by_id(db, user_id)
        if not user:
            return None

        for key, value in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, value)

        user.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(user)
        return user

    @staticmethod
    async def delete(db: AsyncSession, user_id: str) -> bool:
        """Delete user by ID."""
        user = await UserRepository.get_by_id(db, user_id)
        if user:
            await db.delete(user)
            await db.flush()
            logger.info(f"Deleted user: {user_id}")
            return True
        return False


    @staticmethod
    async def update_last_login(db: AsyncSession, user_id: str) -> Optional[User]:
        """Update user's last login timestamp."""
        user = await UserRepository.get_by_id(db, user_id)
        if user:
            user.last_login_at = datetime.utcnow()
            user.updated_at = datetime.utcnow()
            await db.flush()
            await db.refresh(user)
        return user

    @staticmethod
    async def search_users(db: AsyncSession, search_term: str, skip: int = 0, limit: int = 50) -> List[User]:
        """Search users by email, username or full name."""
        result = await db.execute(
            select(User)
            .where(
                or_(
                    User.email.ilike(f"%{search_term}%"),
                    User.username.ilike(f"%{search_term}%"),
                    User.full_name.ilike(f"%{search_term}%")
                )
            )
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
