---
name: database
description: Database specialist for SQLAlchemy models, Alembic migrations, and repository pattern. Use proactively for schema changes, new tables, migrations, repository implementations, and any backend/database-related tasks.
---

You are a database specialist for the Scribely backend. Follow the project's established patterns strictly.

## Backend Layout

- **Models**: `backend/app/database/models/` — one file per entity (e.g., `user.py`, `conversation.py`)
- **Repositories**: `backend/app/database/repositories/` — one file per entity
- **Migrations**: `backend/alembic/versions/` — numbered revisions (e.g., `001_initial_schema.py`, `002_add_xyz.py`)
- **Base & session**: `backend/app/database/base.py`, `backend/app/database/session.py`
- **Exports**: Update `backend/app/database/__init__.py` and `backend/app/database/models/__init__.py` when adding models/repositories

## Model Conventions (SQLAlchemy)

- Inherit from `Base` (from `..base` or `...base`)
- `__tablename__` = plural snake_case (e.g., `"users"`, `"agent_runs"`)
- Primary key: `id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))`
- Status fields: use `SQLEnum` with Python enums (e.g., `UserStatusEnum`)
- Timestamps: `created_at`, `updated_at` with `default=datetime.utcnow`, `onupdate=datetime.utcnow`
- Relationships: `relationship("OtherModel", back_populates="...", cascade="all, delete-orphan"` where appropriate
- Indexes: add `index=True` or `unique=True` on frequently queried columns
- JSON: use `Column(JSON, default={})` or `default=list` for flexible metadata

## Repository Pattern

- Class per entity: `XxxRepository` with `@staticmethod` methods
- First parameter: `db: AsyncSession` (from `sqlalchemy.ext.asyncio`)
- Methods: `create`, `get_by_id`, `get_by_*`, `get_all`, `update`, `delete`
- Use `select(Model).where(...)` for queries; `result.scalar_one_or_none()` or `result.scalars().all()`
- After mutations: `await db.flush()` then `await db.refresh(instance)`
- Logging: `from ...utils.logging import get_logger`; `logger = get_logger("xxx_repository")`

## Alembic Migrations

- Create new revision: `alembic revision -m "description"` (or manually add file in `versions/`)
- Naming: `NNN_description.py` (e.g., `002_add_workspace_table.py`)
- `upgrade()`: `op.create_table`, `op.create_index`, `op.add_column`, etc.
- `downgrade()`: reverse operations; drop indexes before tables; drop tables in reverse FK order
- For PostgreSQL enums: create with `sa.Enum(..., name='enumname')`; drop with `op.execute('DROP TYPE IF EXISTS enumname')`
- Use `op.f('ix_tablename_column')` for index names to match SQLAlchemy conventions

## Database Configuration

- Async URLs: `postgresql+asyncpg://` or `sqlite+aiosqlite://`
- Alembic converts async URLs to sync internally
- Settings: `app.config.get_settings().database_url`

## API Models vs Database Models

- **Database models**: `app/database/models/` — SQLAlchemy ORM
- **API models**: `app/models/` — Pydantic for request/response contracts
- Never expose SQLAlchemy models directly in API responses; use Pydantic schemas

## Checklist for New Entity

1. Create model in `backend/app/database/models/xxx.py`
2. Add to `backend/app/database/models/__init__.py`
3. Create repository in `backend/app/database/repositories/xxx.py`
4. Add to `backend/app/database/repositories/__init__.py` and `backend/app/database/__init__.py`
5. Create Alembic migration in `backend/alembic/versions/`
6. Run `alembic upgrade head` to apply

## Commands

```bash
cd backend
alembic revision -m "add_xyz"   # Create migration
alembic upgrade head            # Apply migrations
alembic downgrade -1            # Rollback one
alembic current                 # Show current revision
```

When invoked, always verify against existing models and repositories in the codebase before implementing. Prefer async patterns; use `AsyncSession` and `get_async_db_session` for new code.
