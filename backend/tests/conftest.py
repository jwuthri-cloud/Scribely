"""
Test configuration and fixtures for Scribely backend tests.
"""

import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from app.config import Settings
from app.database.base import Base, get_db
from app.database.repositories import UserRepository
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


# Test settings
class TestSettings(Settings):
    """Test-specific settings."""
    database_url: str = "sqlite+aiosqlite:///:memory:"
    log_level: str = "DEBUG"
    clerk_secret_key: str = "sk_test_test"
    clerk_publishable_key: str = "pk_test_test"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_settings() -> TestSettings:
    """Get test settings."""
    return TestSettings()


# Database fixtures
@pytest_asyncio.fixture
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def test_db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create test database session."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session


@pytest.fixture
def client(test_settings, test_db_session) -> Generator[TestClient, None, None]:
    """Create test client with dependency overrides."""
    # Override dependencies
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as test_client:
        yield test_client

    # Clean up overrides
    app.dependency_overrides.clear()


# Repository fixtures
@pytest_asyncio.fixture
async def test_user(test_db_session):
    """Create a test user for testing."""
    user = await UserRepository.create(
        db=test_db_session,
        clerk_id="user_test_fixture",
        username="testuser",
        email="test@example.com",
        full_name="Test User"
    )
    await test_db_session.commit()
    return {"id": user.id, "clerk_id": user.clerk_id}
