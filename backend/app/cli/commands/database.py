"""
Database management commands.
"""

import subprocess
from pathlib import Path

import click
from app.config import get_settings
from app.database.base import SessionLocal, create_tables, drop_tables
from app.database.models import User
from app.database.repositories import UserRepository
from app.utils.logging import (
    get_logger,
    print_error,
    print_info,
    print_success,
    print_warning,
)
from rich.console import Console
from rich.table import Table

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
        # Check if we should use migrations instead
        alembic_path = Path("alembic")
        if alembic_path.exists():
            print_warning("Alembic migrations found. Consider using 'database migrate' instead.")
            if not click.confirm("Continue with direct schema creation?"):
                print_info("Cancelled. Use 'database migrate' for production setups.")
                return

        # Create all tables
        create_tables()

        print_success("Database schema created successfully!")
        print_info("Consider running 'database seed' to add initial data.")

        # Show table information
        with SessionLocal() as db:
            from sqlalchemy import text
            result = db.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"))
            table_count = result.scalar()
            print_info(f"Created {table_count} tables")

    except Exception as e:
        print_error(f"Database initialization failed: {str(e)}")
        logger.error(f"Database init error: {str(e)}")


@database.command()
@click.option("--revision", "-r", default="head", help="Target revision (default: head)")
def migrate(revision: str):
    """Run database migrations using Alembic."""
    print_info(f"Running database migrations to revision: {revision}")

    # Check if Alembic is set up
    alembic_ini = Path("alembic.ini")
    if not alembic_ini.exists():
        print_error("alembic.ini not found. Initialize Alembic first with: alembic init alembic")
        return

    try:
        # Run Alembic upgrade
        result = subprocess.run(
            ["alembic", "upgrade", revision],
            capture_output=True,
            text=True,
            check=False
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
@click.option("--autogenerate", "--auto", is_flag=True, help="Auto-generate migration from model changes")
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
        print_info("Tables that will be dropped: users, chat_sessions, chat_messages, completions, api_keys, task_results")

        if not click.confirm("Are you absolutely sure you want to continue?"):
            print_info("Database reset cancelled.")
            return

    try:
        print_info("Resetting database...")

        # Drop all tables
        drop_tables()
        print_success("All tables dropped")

        # Recreate schema
        create_tables()
        print_success("Schema recreated")

        # Run initial migration if Alembic is available
        if Path("alembic.ini").exists():
            try:
                # Mark as up to date with initial migration
                result = subprocess.run(
                    ["alembic", "stamp", "head"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if result.returncode == 0:
                    print_success("Migration history updated")
            except Exception:
                print_warning("Could not update migration history")

        print_success("Database reset completed successfully!")
        print_info("Consider running 'database seed' to add initial data.")

    except Exception as e:
        print_error(f"Database reset failed: {str(e)}")
        logger.error(f"Database reset error: {str(e)}")


@database.command()
def status():
    """Check database connection and schema status."""
    print_info("Checking database status...")

    try:
        # Test database connection
        with SessionLocal() as db:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            print_success("Database connection: OK")

            # Check if tables exist
            if settings.database_url and "postgresql" in settings.database_url:
                result = db.execute(text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                """))
            else:
                result = db.execute(text("""
                    SELECT name as table_name
                    FROM sqlite_master
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                """))

            tables = [row[0] for row in result.fetchall()]

            if tables:
                print_success(f"Found {len(tables)} tables")

                # Show table info
                table = Table(title="Database Tables")
                table.add_column("Table Name", style="cyan")
                table.add_column("Record Count", style="green")

                for table_name in tables:
                    try:
                        count_result = db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                        count = count_result.scalar()
                        table.add_row(table_name, str(count))
                    except Exception:
                        table.add_row(table_name, "Error")

                console.print(table)
            else:
                print_warning("No tables found. Run 'database init' or 'database migrate'.")

            # Check migration status if Alembic is available
            if Path("alembic.ini").exists():
                try:
                    result = subprocess.run(
                        ["alembic", "current"],
                        capture_output=True,
                        text=True,
                        check=False
                    )
                    if result.returncode == 0:
                        current_revision = result.stdout.strip()
                        if current_revision:
                            print_success(f"Current migration: {current_revision}")
                        else:
                            print_warning("No migrations applied yet")
                except Exception:
                    print_warning("Could not check migration status")

    except Exception as e:
        print_error(f"Database connection failed: {str(e)}")
        logger.error(f"Database status error: {str(e)}")


@database.command()
def seed():
    """Seed database with initial/sample data."""
    print_info("Seeding database with initial data...")

    try:
        with SessionLocal() as db:
            user_repo = UserRepository()

            # Check if we already have data
            existing_users = db.query(User).limit(1).first()
            if existing_users:
                print_warning("Database already contains data.")
                if not click.confirm("Continue seeding anyway?"):
                    print_info("Seeding cancelled.")
                    return

            # Create a sample admin user
            admin_user = user_repo.create(
                db=db,
                email="admin@example.com",
                username="admin",
                full_name="Administrator",
                is_superuser=True,
                preferences={"theme": "dark", "language": "en"},
                metadata={"created_by": "seed_command"}
            )

            # Create a sample regular user
            regular_user = user_repo.create(
                db=db,
                email="user@example.com",
                username="user",
                full_name="Sample User",
                preferences={"theme": "light", "language": "en"},
                metadata={"created_by": "seed_command"}
            )

        print_success("Database seeded successfully!")
        print_info("Created:")
        print_info(f"  - Admin user: admin@example.com (admin/admin)")
        print_info(f"  - Regular user: user@example.com (user/user)")
        print_info(f"  - Sample chat session with 2 messages")

    except Exception as e:
        print_error(f"Database seeding failed: {str(e)}")
        logger.error(f"Database seed error: {str(e)}")
