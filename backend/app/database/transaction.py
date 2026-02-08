"""
Database transaction management utilities.
"""

from contextlib import asynccontextmanager, contextmanager
from functools import wraps
from typing import Any, AsyncGenerator, Callable, Generator

from app.exceptions import DatabaseError
from app.utils.logging import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

logger = get_logger("database.transaction")


@contextmanager
def transaction_scope(db: Session) -> Generator[Session, None, None]:
    """
    Provide a transactional scope around a series of operations.

    Usage:
        with transaction_scope(db) as session:
            # Do database operations
            user_repo.create(session, ...)
            chat_repo.create(session, ...)
    """
    try:
        yield db
        db.commit()
        logger.debug("Transaction committed successfully")
    except Exception as e:
        db.rollback()
        logger.error(f"Transaction rolled back due to error: {e}")
        raise DatabaseError(f"Transaction failed: {str(e)}") from e


@asynccontextmanager
async def async_transaction_scope(db: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """
    Provide an async transactional scope around a series of operations.

    Usage:
        async with async_transaction_scope(db) as session:
            # Do async database operations
            await user_repo.async_create(session, ...)
            await chat_repo.async_create(session, ...)
    """
    try:
        yield db
        await db.commit()
        logger.debug("Async transaction committed successfully")
    except Exception as e:
        await db.rollback()
        logger.error(f"Async transaction rolled back due to error: {e}")
        raise DatabaseError(f"Async transaction failed: {str(e)}") from e


def transactional(func: Callable) -> Callable:
    """
    Decorator to wrap a function in a database transaction.

    Usage:
        @transactional
        def create_user_with_session(db: Session, user_data: dict, session_data: dict):
            user = user_repo.create(db, **user_data)
            session = session_repo.create(db, user_id=user.id, **session_data)
            return user, session
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        # Find the database session in arguments
        db = None
        for arg in args:
            if isinstance(arg, Session):
                db = arg
                break

        if db is None:
            for key, value in kwargs.items():
                if isinstance(value, Session):
                    db = value
                    break

        if db is None:
            raise ValueError("No database session found in function arguments")

        with transaction_scope(db):
            return func(*args, **kwargs)

    return wrapper


def async_transactional(func: Callable) -> Callable:
    """
    Decorator to wrap an async function in a database transaction.

    Usage:
        @async_transactional
        async def create_user_with_session(db: AsyncSession, user_data: dict, session_data: dict):
            user = await user_repo.async_create(db, **user_data)
            session = await session_repo.async_create(db, user_id=user.id, **session_data)
            return user, session
    """
    @wraps(func)
    async def wrapper(*args, **kwargs) -> Any:
        # Find the database session in arguments
        db = None
        for arg in args:
            if isinstance(arg, AsyncSession):
                db = arg
                break

        if db is None:
            for key, value in kwargs.items():
                if isinstance(value, AsyncSession):
                    db = value
                    break

        if db is None:
            raise ValueError("No async database session found in function arguments")

        async with async_transaction_scope(db):
            return await func(*args, **kwargs)

    return wrapper


class TransactionManager:
    """
    Advanced transaction manager for complex operations.
    """

    def __init__(self, db: Session):
        self.db = db
        self._savepoints = []

    def savepoint(self) -> str:
        """Create a savepoint and return its name."""
        savepoint_name = f"sp_{len(self._savepoints)}"
        self.db.begin_nested()
        self._savepoints.append(savepoint_name)
        logger.debug(f"Created savepoint: {savepoint_name}")
        return savepoint_name

    def rollback_to_savepoint(self, savepoint_name: str = None):
        """Rollback to a specific savepoint or the most recent one."""
        if not self._savepoints:
            raise DatabaseError("No savepoints available")

        if savepoint_name is None:
            savepoint_name = self._savepoints[-1]

        try:
            self.db.rollback()
            if savepoint_name in self._savepoints:
                # Remove savepoints after the rolled back one
                index = self._savepoints.index(savepoint_name)
                self._savepoints = self._savepoints[:index]

            logger.debug(f"Rolled back to savepoint: {savepoint_name}")
        except Exception as e:
            logger.error(f"Failed to rollback to savepoint {savepoint_name}: {e}")
            raise DatabaseError(f"Savepoint rollback failed: {str(e)}") from e

    def commit(self):
        """Commit the transaction and clear savepoints."""
        try:
            self.db.commit()
            self._savepoints.clear()
            logger.debug("Transaction committed, savepoints cleared")
        except Exception as e:
            logger.error(f"Transaction commit failed: {e}")
            raise DatabaseError(f"Transaction commit failed: {str(e)}") from e

    def rollback(self):
        """Rollback the entire transaction and clear savepoints."""
        try:
            self.db.rollback()
            self._savepoints.clear()
            logger.debug("Transaction rolled back, savepoints cleared")
        except Exception as e:
            logger.error(f"Transaction rollback failed: {e}")
            raise DatabaseError(f"Transaction rollback failed: {str(e)}") from e


# Bulk operations helpers to prevent N+1 queries

def bulk_load_related(db: Session, primary_objects: list, relation_loader: Callable) -> dict:
    """
    Bulk load related objects to prevent N+1 queries.

    Args:
        db: Database session
        primary_objects: List of primary objects that need related data
        relation_loader: Function that takes a list of IDs and returns related objects

    Returns:
        Dictionary mapping primary object IDs to their related objects
    """
    if not primary_objects:
        return {}

    # Extract IDs from primary objects
    primary_ids = [getattr(obj, 'id') for obj in primary_objects]

    # Bulk load related objects
    related_objects = relation_loader(db, primary_ids)

    # Group related objects by primary ID
    related_by_id = {}
    for related in related_objects:
        primary_id = getattr(related, f"{primary_objects[0].__class__.__name__.lower()}_id")
        if primary_id not in related_by_id:
            related_by_id[primary_id] = []
        related_by_id[primary_id].append(related)

    return related_by_id


def optimize_query_for_eager_loading(query, relationships: list):
    """
    Add eager loading to prevent N+1 queries.

    Args:
        query: SQLAlchemy query object
        relationships: List of relationship names to eagerly load

    Returns:
        Optimized query with eager loading
    """
    from sqlalchemy.orm import joinedload

    for relationship in relationships:
        query = query.options(joinedload(relationship))

    return query
