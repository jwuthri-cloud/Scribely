"""
Database configuration and session management for Scribely.
"""

import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import get_settings

# Get settings
settings = get_settings()

# Configure logging - WARNING to suppress verbose SQL query logs
logging.basicConfig()
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# Create Base class for declarative models (shared between sync and async)
Base = declarative_base()

# Legacy sync database support (for backwards compatibility)
# Only create sync engine if URL is actually sync (not async)
database_url = settings.database_url or ""
if database_url.startswith("postgresql://") and "+asyncpg" not in database_url:
    # Sync PostgreSQL
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        echo=settings.debug,
    )
elif database_url.startswith("sqlite://") and "+aiosqlite" not in database_url:
    # Sync SQLite
    engine = create_engine(
        database_url, connect_args={"check_same_thread": False}, echo=settings.debug
    )
elif (
    not database_url
    or database_url.startswith("postgresql+asyncpg")
    or database_url.startswith("sqlite+aiosqlite")
):
    # Async URL or no URL - create a dummy sync engine that won't be used
    # This prevents errors but the sync engine won't actually work with async URLs
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        echo=False,  # Don't echo for dummy engine
    )
else:
    # Fallback - in-memory SQLite for testing
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        echo=settings.debug,
    )

# Create SessionLocal class (legacy sync support)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    Get database session for dependency injection (legacy sync).

    Note: This is deprecated. Use get_async_db_session() from session.py instead.

    Yields:
        Session: SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all database tables (legacy sync)."""
    Base.metadata.create_all(bind=engine)


def drop_tables():
    """Drop all database tables (legacy sync)."""
    Base.metadata.drop_all(bind=engine)
