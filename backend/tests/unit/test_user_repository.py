"""
Unit tests for UserRepository.

Tests cover all CRUD operations and Clerk-based authentication flow.
"""

from datetime import datetime

import pytest
from app.database.models import UserStatusEnum
from app.database.repositories import UserRepository


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.database
class TestUserRepository:
    """Test UserRepository class."""

    async def test_create_user(self, test_db_session):
        """Test user creation with Clerk ID."""
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_test123",
            username="testuser",
            email="test@example.com",
            full_name="Test User"
        )

        assert user.clerk_id == "user_test123"
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.full_name == "Test User"
        assert user.is_superuser is False
        assert user.status == UserStatusEnum.ACTIVE
        assert user.is_active is True
        assert isinstance(user.created_at, datetime)
        assert isinstance(user.updated_at, datetime)

    async def test_create_user_minimal(self, test_db_session):
        """Test user creation with only Clerk ID (minimal required fields)."""
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_minimal123"
        )

        assert user.clerk_id == "user_minimal123"
        assert user.email is None
        assert user.username is None
        assert user.status == UserStatusEnum.ACTIVE
        assert user.is_active is True

    async def test_get_user_by_id(self, test_db_session):
        """Test getting user by ID."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_get_by_id",
            username="getuser",
            email="get@example.com"
        )
        await test_db_session.commit()

        # Get user by ID
        found_user = await UserRepository.get_by_id(test_db_session, user.id)
        assert found_user is not None
        assert found_user.id == user.id
        assert found_user.clerk_id == "user_get_by_id"
        assert found_user.username == "getuser"

    async def test_get_user_by_id_not_found(self, test_db_session):
        """Test getting non-existent user by ID."""
        found_user = await UserRepository.get_by_id(test_db_session, "nonexistent-id")
        assert found_user is None

    async def test_get_user_by_clerk_id(self, test_db_session):
        """Test getting user by Clerk ID."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_clerk_lookup",
            username="clerkuser",
            email="clerk@example.com"
        )
        await test_db_session.commit()

        # Get user by Clerk ID
        found_user = await UserRepository.get_by_clerk_id(test_db_session, "user_clerk_lookup")
        assert found_user is not None
        assert found_user.clerk_id == "user_clerk_lookup"
        assert found_user.id == user.id

    async def test_get_user_by_clerk_id_not_found(self, test_db_session):
        """Test getting non-existent user by Clerk ID."""
        found_user = await UserRepository.get_by_clerk_id(test_db_session, "nonexistent-clerk-id")
        assert found_user is None

    async def test_get_user_by_email(self, test_db_session):
        """Test getting user by email."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_email_lookup",
            email="email@example.com"
        )
        await test_db_session.commit()

        # Get user by email
        found_user = await UserRepository.get_by_email(test_db_session, "email@example.com")
        assert found_user is not None
        assert found_user.email == "email@example.com"
        assert found_user.id == user.id

    async def test_get_user_by_email_not_found(self, test_db_session):
        """Test getting non-existent user by email."""
        found_user = await UserRepository.get_by_email(test_db_session, "notfound@example.com")
        assert found_user is None

    async def test_get_user_by_username(self, test_db_session):
        """Test getting user by username."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_username_lookup",
            username="usernameuser"
        )
        await test_db_session.commit()

        # Get user by username
        found_user = await UserRepository.get_by_username(test_db_session, "usernameuser")
        assert found_user is not None
        assert found_user.username == "usernameuser"
        assert found_user.id == user.id

    async def test_get_user_by_username_not_found(self, test_db_session):
        """Test getting non-existent user by username."""
        found_user = await UserRepository.get_by_username(test_db_session, "nonexistentuser")
        assert found_user is None

    async def test_update_user(self, test_db_session):
        """Test user update."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_update_test",
            username="originaluser",
            email="original@example.com",
            full_name="Original Name"
        )
        await test_db_session.commit()

        # Update user
        updated_user = await UserRepository.update(
            db=test_db_session,
            user_id=user.id,
            full_name="Updated Name",
            preferences={"theme": "dark", "language": "en"}
        )

        assert updated_user is not None
        assert updated_user.full_name == "Updated Name"
        assert updated_user.preferences == {"theme": "dark", "language": "en"}
        assert updated_user.updated_at is not None
        assert updated_user.updated_at > user.created_at

    async def test_update_user_status(self, test_db_session):
        """Test updating user status."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_status_test",
            username="statususer"
        )
        await test_db_session.commit()

        # Update status to INACTIVE
        updated_user = await UserRepository.update(
            db=test_db_session,
            user_id=user.id,
            status=UserStatusEnum.INACTIVE
        )

        assert updated_user.status == UserStatusEnum.INACTIVE
        assert updated_user.is_active is False

        # Update status back to ACTIVE
        reactivated_user = await UserRepository.update(
            db=test_db_session,
            user_id=user.id,
            status=UserStatusEnum.ACTIVE
        )

        assert reactivated_user.status == UserStatusEnum.ACTIVE
        assert reactivated_user.is_active is True

    async def test_update_user_not_found(self, test_db_session):
        """Test updating non-existent user."""
        updated_user = await UserRepository.update(
            db=test_db_session,
            user_id="nonexistent-id",
            full_name="Should Not Work"
        )
        assert updated_user is None

    async def test_delete_user(self, test_db_session):
        """Test user deletion."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_delete_test",
            username="deleteuser"
        )
        await test_db_session.commit()

        # Delete user
        deleted = await UserRepository.delete(test_db_session, user.id)
        assert deleted is True

        # Verify user is deleted
        found_user = await UserRepository.get_by_id(test_db_session, user.id)
        assert found_user is None

    async def test_delete_user_not_found(self, test_db_session):
        """Test deleting non-existent user."""
        deleted = await UserRepository.delete(test_db_session, "nonexistent-id")
        assert deleted is False

    async def test_get_all_users(self, test_db_session):
        """Test getting all users with pagination."""
        # Create multiple users
        for i in range(5):
            await UserRepository.create(
                db=test_db_session,
                clerk_id=f"user_list_{i}",
                username=f"user{i}",
                email=f"user{i}@example.com"
            )
        await test_db_session.commit()

        # Get all users
        users = await UserRepository.get_all(test_db_session, skip=0, limit=10)
        assert len(users) == 5

        # Test pagination
        users_page1 = await UserRepository.get_all(test_db_session, skip=0, limit=3)
        assert len(users_page1) == 3

        users_page2 = await UserRepository.get_all(test_db_session, skip=3, limit=3)
        assert len(users_page2) == 2

    async def test_get_all_users_empty(self, test_db_session):
        """Test getting all users when none exist."""
        users = await UserRepository.get_all(test_db_session)
        assert len(users) == 0

    async def test_update_last_login(self, test_db_session):
        """Test updating user's last login timestamp."""
        # Create user
        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_login_test",
            username="loginuser"
        )
        await test_db_session.commit()

        assert user.last_login_at is None

        # Update last login
        updated_user = await UserRepository.update_last_login(test_db_session, user.id)
        assert updated_user is not None
        assert updated_user.last_login_at is not None
        assert isinstance(updated_user.last_login_at, datetime)

    async def test_update_last_login_not_found(self, test_db_session):
        """Test updating last login for non-existent user."""
        updated_user = await UserRepository.update_last_login(test_db_session, "nonexistent-id")
        assert updated_user is None

    async def test_search_users_by_email(self, test_db_session):
        """Test searching users by email."""
        # Create users
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search1",
            email="john.doe@example.com",
            full_name="John Doe"
        )
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search2",
            email="jane.smith@example.com",
            full_name="Jane Smith"
        )
        await test_db_session.commit()

        # Search by email
        results = await UserRepository.search_users(test_db_session, "john")
        assert len(results) == 1
        assert results[0].email == "john.doe@example.com"

    async def test_search_users_by_username(self, test_db_session):
        """Test searching users by username."""
        # Create users
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search3",
            username="johndoe",
            full_name="John Doe"
        )
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search4",
            username="janesmith",
            full_name="Jane Smith"
        )
        await test_db_session.commit()

        # Search by username
        results = await UserRepository.search_users(test_db_session, "john")
        assert len(results) == 1
        assert results[0].username == "johndoe"

    async def test_search_users_by_full_name(self, test_db_session):
        """Test searching users by full name."""
        # Create users
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search5",
            full_name="John Doe"
        )
        await UserRepository.create(
            db=test_db_session,
            clerk_id="user_search6",
            full_name="Jane Smith"
        )
        await test_db_session.commit()

        # Search by full name
        results = await UserRepository.search_users(test_db_session, "Doe")
        assert len(results) == 1
        assert results[0].full_name == "John Doe"

    async def test_search_users_pagination(self, test_db_session):
        """Test searching users with pagination."""
        # Create multiple users
        for i in range(10):
            await UserRepository.create(
                db=test_db_session,
                clerk_id=f"user_search_pag_{i}",
                username=f"user{i}",
                email=f"user{i}@example.com"
            )
        await test_db_session.commit()

        # Search with pagination
        results = await UserRepository.search_users(test_db_session, "user", skip=0, limit=5)
        assert len(results) == 5

        results_page2 = await UserRepository.search_users(test_db_session, "user", skip=5, limit=5)
        assert len(results_page2) == 5

    async def test_search_users_no_results(self, test_db_session):
        """Test searching users with no matches."""
        results = await UserRepository.search_users(test_db_session, "nonexistent")
        assert len(results) == 0

    async def test_user_is_active_property(self, test_db_session):
        """Test user is_active property based on status."""
        # Create active user
        active_user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_active",
            status=UserStatusEnum.ACTIVE
        )
        assert active_user.is_active is True

        # Update to inactive
        inactive_user = await UserRepository.update(
            db=test_db_session,
            user_id=active_user.id,
            status=UserStatusEnum.INACTIVE
        )
        assert inactive_user.is_active is False

        # Update to suspended
        suspended_user = await UserRepository.update(
            db=test_db_session,
            user_id=active_user.id,
            status=UserStatusEnum.SUSPENDED
        )
        assert suspended_user.is_active is False

    async def test_user_preferences(self, test_db_session):
        """Test user preferences storage."""
        preferences = {
            "theme": "dark",
            "language": "en",
            "notifications": True,
            "timezone": "UTC"
        }

        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_prefs",
            preferences=preferences
        )

        assert user.preferences == preferences
        assert user.preferences["theme"] == "dark"

    async def test_user_extra_metadata(self, test_db_session):
        """Test user extra metadata storage."""
        metadata = {
            "source": "clerk",
            "signup_method": "oauth",
            "custom_field": "value"
        }

        user = await UserRepository.create(
            db=test_db_session,
            clerk_id="user_metadata",
            extra_metadata=metadata
        )

        assert user.extra_metadata == metadata
        assert user.extra_metadata["source"] == "clerk"
