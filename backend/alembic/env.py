"""
Alembic environment configuration for AssistMe.
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import get_settings

# Import your models and database base
from app.database.base import Base
from app.database.models import *  # Import all models

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

# Get database URL from settings
settings = get_settings()
database_url = settings.database_url

# Convert async URLs to sync for Alembic (Alembic uses sync engines)
def get_sync_database_url(url: str) -> str:
    """Convert async database URL to sync for Alembic."""
    if not url:
        return "sqlite:///:memory:"
    
    # Convert async URLs to sync
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    # Already sync or unknown format - return as-is
    return url

# Convert to sync URL for Alembic
sync_database_url = get_sync_database_url(database_url)

# Override the sqlalchemy.url in alembic.ini with the sync version
config.set_main_option("sqlalchemy.url", sync_database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Create engine configuration
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = sync_database_url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
