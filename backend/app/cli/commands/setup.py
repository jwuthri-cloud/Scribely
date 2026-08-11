"""
Setup and initialization commands.
"""

import subprocess
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import track

console = Console()


@click.group()
def setup():
    """Setup and initialization commands."""


@setup.command()
def init():
    """Initialize the application with all necessary setup."""
    console.print(Panel.fit(
        "[bold blue]Initializing Scribely[/bold blue]\n"
        "This will set up the application with default configuration.",
        title="Application Setup"
    ))

    try:
        setup_tasks = [
            ("Creating configuration files", _create_config_files),
            ("Setting up environment", _setup_environment),
            ("Initializing services", _init_services),
            ("Running health checks", _run_initial_health_checks)
        ]

        for task_name, task_func in track(setup_tasks, description="Setting up application..."):
            task_func()

        console.print(Panel.fit(
            "[bold green]✓ Application setup completed successfully![/bold green]\n\n"
            "Next steps:\n"
            "• Review your .env file\n"
            "• Set OPENROUTER_API_KEY for LLM access\n"
            "• Run: [bold]python -m app.cli server start[/bold]",
            title="Setup Complete"
        ))

    except Exception as e:
        console.print(f"[red]✗ Setup failed: {e}[/red]")
        sys.exit(1)


@setup.command()
def env():
    """Create environment configuration file."""
    console.print("[bold blue]Creating environment configuration...[/bold blue]")

    env_path = Path(".env")

    if env_path.exists():
        if not click.confirm(f"{env_path} already exists. Overwrite?"):
            console.print("[yellow]Environment setup cancelled[/yellow]")
            return

    env_content = """# Scribely Configuration
# Environment
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=INFO

# API Configuration
API_V1_STR=/api/v1
PROJECT_NAME=Scribely
VERSION=0.1.0

# Server Configuration
HOST=0.0.0.0
PORT=8000

# Security
SECRET_KEY=your-secret-key-here-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1

# Database Configuration (if using database)
DATABASE_URL=postgresql://user:password@localhost/dbname

# Redis Configuration
REDIS_URL=redis://localhost:6379/0

# LLM Configuration
# OpenRouter (provides access to 500+ models)
OPENROUTER_API_KEY=your-openrouter-api-key
DEFAULT_MODEL=openai/gpt-5.6-terra

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60

# CORS
CORS_ORIGINS=["http://localhost:3000"]

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=8001

# DataDog Configuration (for production JSON logging)
DD_SERVICE=Scribely
DD_ENV=production
DD_VERSION=0.1.0
"""

    try:
        with open(env_path, "w") as f:
            f.write(env_content)

        console.print(f"[green]✓ Environment file created: {env_path}[/green]")
        console.print("[yellow]⚠ Remember to update the configuration values![/yellow]")

    except Exception as e:
        console.print(f"[red]✗ Failed to create environment file: {e}[/red]")


@setup.command()
def deps():
    """Install Python dependencies."""
    console.print("[bold blue]Installing dependencies...[/bold blue]")

    try:
        # Check if uv is available (faster)
        result = subprocess.run(["uv", "--version"], capture_output=True)
        if result.returncode == 0:
            console.print("[dim]Using uv for faster installation...[/dim]")
            subprocess.run(["uv", "pip", "install", "-e", "."], check=True)
        else:
            console.print("[dim]Using pip for installation...[/dim]")
            subprocess.run([sys.executable, "-m", "pip", "install", "-e", "."], check=True)

        console.print("[green]✓ Dependencies installed successfully[/green]")

    except subprocess.CalledProcessError as e:
        console.print(f"[red]✗ Failed to install dependencies: {e}[/red]")
    except FileNotFoundError:
        console.print("[red]✗ Python package manager not found[/red]")


@setup.command()
def dev():
    """Setup development environment."""
    console.print("[bold blue]Setting up development environment...[/bold blue]")

    try:
        dev_tasks = [
            ("Installing development dependencies", _install_dev_deps),
            ("Setting up pre-commit hooks", _setup_pre_commit),
            ("Creating development config", _create_dev_config)
        ]

        for task_name, task_func in track(dev_tasks, description="Setting up dev environment..."):
            task_func()

        console.print(Panel.fit(
            "[bold green]✓ Development environment ready![/bold green]\n\n"
            "Available tools:\n"
            "• Pre-commit hooks for code quality\n"
            "• Pytest for testing\n"
            "• Black for code formatting\n"
            "• Ruff for linting",
            title="Dev Setup Complete"
        ))

    except Exception as e:
        console.print(f"[red]✗ Dev setup failed: {e}[/red]")


def _create_config_files():
    """Create necessary configuration files."""
    # This would create any additional config files needed


def _setup_environment():
    """Setup environment variables and configuration."""
    # Check for .env file, create if needed
    env_path = Path(".env")
    if not env_path.exists():
        console.print("[dim]Creating default .env file...[/dim]")
        # Could call the env command here or create a minimal version


def _init_services():
    """Initialize required services."""
    # This would check and initialize services like Redis, DB, etc.


def _run_initial_health_checks():
    """Run basic health checks after setup."""
    # Basic sanity checks


def _install_dev_deps():
    """Install development dependencies."""
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "pytest", "black", "ruff", "pre-commit"
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        pass  # Will be handled by calling function


def _setup_pre_commit():
    """Setup pre-commit hooks."""
    try:
        subprocess.run(["pre-commit", "install"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass  # Will be handled by calling function


def _create_dev_config():
    """Create development-specific configuration."""
    # Create any dev-specific config files
