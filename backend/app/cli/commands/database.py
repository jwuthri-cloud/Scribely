"""
Database management commands.
"""

import asyncio
import subprocess
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from app.config import get_settings
from app.database.repositories.user import UserRepository
from app.database.session import (
    DatabaseManager,
    get_async_session,
    get_database_manager,
)
from app.utils.logging import (
    get_logger,
    print_error,
    print_info,
    print_success,
    print_warning,
)

console = Console()
logger = get_logger("database_cli")
settings = get_settings()


@click.group()
def database():
    """Manage database operations."""


@database.command()
def init():
    """Initialize database schema."""
    print_info("Initializing database schema...")

    try:
        alembic_path = Path("alembic")
        if alembic_path.exists():
            print_warning(
                "Alembic migrations found. Consider using 'database migrate' instead."
            )
            if not click.confirm("Continue with direct schema creation?"):
                print_info("Cancelled. Use 'database migrate' for production setups.")
                return

        db_manager = get_database_manager()
        asyncio.get_event_loop().run_until_complete(db_manager.create_tables())

        print_success("Database schema created successfully!")
        print_info("Consider running 'database seed' to add initial data.")

    except Exception as e:
        print_error(f"Database initialization failed: {str(e)}")
        logger.error(f"Database init error: {str(e)}")


@database.command()
@click.option(
    "--revision", "-r", default="head", help="Target revision (default: head)"
)
def migrate(revision: str):
    """Run database migrations using Alembic."""
    print_info(f"Running database migrations to revision: {revision}")

    alembic_ini = Path("alembic.ini")
    if not alembic_ini.exists():
        print_error(
            "alembic.ini not found. Initialize Alembic first with: alembic init alembic"
        )
        return

    try:
        result = subprocess.run(
            ["alembic", "upgrade", revision],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode == 0:
            print_success(f"Migrations completed successfully to revision: {revision}")
            if result.stdout:
                console.print(result.stdout)
        else:
            print_error(f"Migration failed: {result.stderr}")
            if result.stdout:
                console.print(result.stdout)

    except FileNotFoundError:
        print_error("Alembic not found. Install it with: pip install alembic")
    except Exception as e:
        print_error(f"Migration error: {str(e)}")
        logger.error(f"Migration error: {str(e)}")


@database.command()
@click.option("--message", "-m", required=True, help="Migration message")
@click.option(
    "--autogenerate",
    "--auto",
    is_flag=True,
    help="Auto-generate migration from model changes",
)
def revision(message: str, autogenerate: bool):
    """Create a new database migration."""
    print_info(f"Creating new migration: {message}")

    try:
        cmd = ["alembic", "revision"]
        if autogenerate:
            cmd.append("--autogenerate")
        cmd.extend(["-m", message])

        result = subprocess.run(cmd, capture_output=True, text=True, check=False)

        if result.returncode == 0:
            print_success(f"Migration created: {message}")
            if result.stdout:
                console.print(result.stdout)
        else:
            print_error(f"Migration creation failed: {result.stderr}")

    except FileNotFoundError:
        print_error("Alembic not found. Install it with: pip install alembic")
    except Exception as e:
        print_error(f"Migration creation error: {str(e)}")


@database.command()
@click.option("--force", is_flag=True, help="Skip confirmation prompt")
def reset(force: bool):
    """Reset database (WARNING: This will delete all data)."""
    if not force:
        print_warning("This will delete ALL data in the database!")
        print_info("Tables that will be dropped: users")

        if not click.confirm("Are you absolutely sure you want to continue?"):
            print_info("Database reset cancelled.")
            return

    try:
        print_info("Resetting database...")
        db_manager = get_database_manager()

        asyncio.get_event_loop().run_until_complete(db_manager.drop_tables())
        print_success("All tables dropped")

        asyncio.get_event_loop().run_until_complete(db_manager.create_tables())
        print_success("Schema recreated")

        if Path("alembic.ini").exists():
            try:
                result = subprocess.run(
                    ["alembic", "stamp", "head"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode == 0:
                    print_success("Migration history updated")
            except Exception:
                print_warning("Could not update migration history")

        print_success("Database reset completed successfully!")

    except Exception as e:
        print_error(f"Database reset failed: {str(e)}")
        logger.error(f"Database reset error: {str(e)}")


@database.command()
def status():
    """Check database connection and schema status."""
    print_info("Checking database status...")

    async def _check():
        db_manager = get_database_manager()
        healthy = await db_manager.health_check()
        if healthy:
            print_success("Database connection: OK")
        else:
            print_error("Database connection: FAILED")
            return

        from sqlalchemy import text

        async with get_async_session() as session:
            if settings.database_url and "postgresql" in settings.database_url:
                result = await session.execute(text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                """))
            else:
                result = await session.execute(text("""
                    SELECT name as table_name
                    FROM sqlite_master
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                """))

            tables = [row[0] for row in result.fetchall()]

            if tables:
                print_success(f"Found {len(tables)} tables")

                table_display = Table(title="Database Tables")
                table_display.add_column("Table Name", style="cyan")
                table_display.add_column("Record Count", style="green")

                for table_name in tables:
                    try:
                        count_result = await session.execute(
                            text(f"SELECT COUNT(*) FROM {table_name}")
                        )
                        count = count_result.scalar()
                        table_display.add_row(table_name, str(count))
                    except Exception:
                        table_display.add_row(table_name, "Error")

                console.print(table_display)
            else:
                print_warning(
                    "No tables found. Run 'database init' or 'database migrate'."
                )

        if Path("alembic.ini").exists():
            try:
                result = subprocess.run(
                    ["alembic", "current"], capture_output=True, text=True, check=False
                )
                if result.returncode == 0:
                    current_revision = result.stdout.strip()
                    if current_revision:
                        print_success(f"Current migration: {current_revision}")
                    else:
                        print_warning("No migrations applied yet")
            except Exception:
                print_warning("Could not check migration status")

    try:
        asyncio.get_event_loop().run_until_complete(_check())
    except Exception as e:
        print_error(f"Database status check failed: {str(e)}")
        logger.error(f"Database status error: {str(e)}")


@database.command()
def seed():
    """Seed database with a sample admin user."""
    print_info("Seeding database with initial data...")

    async def _seed():
        async with get_async_session() as session:
            existing = await UserRepository.get_by_clerk_id(session, "clerk_seed_admin")
            if existing:
                print_warning("Database already contains seed data.")
                if not click.confirm("Continue seeding anyway?"):
                    print_info("Seeding cancelled.")
                    return

            await UserRepository.create(
                session,
                clerk_id="clerk_seed_admin",
                email="admin@example.com",
                username="admin",
                full_name="Administrator",
                is_superuser=True,
                role="admin",
                preferences={"theme": "dark", "language": "en"},
                extra_metadata={"created_by": "seed_command"},
            )
            await session.commit()

        print_success("Database seeded successfully!")
        print_info("Created: Admin user (admin@example.com, clerk_id=clerk_seed_admin)")

    try:
        asyncio.get_event_loop().run_until_complete(_seed())
    except Exception as e:
        print_error(f"Database seeding failed: {str(e)}")
        logger.error(f"Database seed error: {str(e)}")
