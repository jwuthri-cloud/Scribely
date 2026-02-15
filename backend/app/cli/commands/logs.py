"""
Logging management and testing commands.
"""

import json
import os
from datetime import datetime

import click
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table

from ...config import get_settings
from ...utils.logging import get_logger, setup_logging

console = Console()


@click.group()
def logs():
    """Manage logging and test log outputs."""


@logs.command()
@click.option(
    "--format",
    type=click.Choice(["rich", "json"]),
    help="Force specific log format for testing"
)
@click.option(
    "--level",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
    default="INFO",
    help="Log level for test messages"
)
def test(format, level):
    """Test logging output with sample messages."""

    if format:
        # Temporarily override environment for testing
        original_env = os.environ.get('ENVIRONMENT')
        if format == "json":
            os.environ['ENVIRONMENT'] = 'production'
        else:
            os.environ['ENVIRONMENT'] = 'development'

    try:
        # Setup logging with current environment
        settings = get_settings()
        setup_logging(settings.log_level, settings.environment)

        # Get logger for testing
        logger = get_logger("test_logger")

        console.print(Panel.fit(
            f"[bold blue]Testing logging output[/bold blue]\n"
            f"Format: {format or 'auto-detect'}\n"
            f"Environment: {os.environ.get('ENVIRONMENT', 'not set')}\n"
            f"Level: {level}",
            title="Log Test"
        ))

        # Test different log levels
        test_messages = [
            ("DEBUG", "This is a debug message with detailed information"),
            ("INFO", "Application started successfully"),
            ("WARNING", "This is a warning message about potential issues"),
            ("ERROR", "An error occurred while processing request"),
            ("CRITICAL", "Critical system failure detected")
        ]

        for msg_level, message in test_messages:
            if getattr(logger, msg_level.lower(), None):
                getattr(logger, msg_level.lower())(f"{msg_level}: {message}")

        # Test exception logging
        try:
            raise ValueError("This is a test exception for logging")
        except Exception:
            logger.exception("Exception caught during test")

        console.print("\n[green]✓ Log test completed![/green]")
        console.print(f"[dim]Check logs/app.log and logs/error.log for file output[/dim]")

    finally:
        # Restore original environment
        if format and original_env:
            os.environ['ENVIRONMENT'] = original_env
        elif format and not original_env:
            os.environ.pop('ENVIRONMENT', None)


@logs.command()
def status():
    """Show current logging configuration."""

    settings = get_settings()
    environment = os.environ.get('ENVIRONMENT', 'not set')

    table = Table(title="Logging Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Environment", environment)
    table.add_row("Log Level", settings.log_level)
    table.add_row("DataDog Service", os.environ.get('DD_SERVICE', 'not set'))
    table.add_row("DataDog Environment", os.environ.get('DD_ENV', 'not set'))
    table.add_row("DataDog Version", os.environ.get('DD_VERSION', 'not set'))

    console.print(table)

    # Show log format based on environment
    if environment == 'production':
        console.print(Panel.fit(
            "[bold]Production Mode[/bold]\n"
            "• JSON logs to stdout\n"
            "• DataDog correlation IDs\n"
            "• Structured error logging\n"
            "• File backup logging",
            title="Active Log Format"
        ))
    else:
        console.print(Panel.fit(
            "[bold]Development Mode[/bold]\n"
            "• Rich console formatting\n"
            "• Colored output with tracebacks\n"
            "• Human-readable file logs\n"
            "• Enhanced error details",
            title="Active Log Format"
        ))


@logs.command()
@click.option(
    "--lines", "-n",
    default=50,
    type=int,
    help="Number of lines to show"
)
@click.option(
    "--follow", "-f",
    is_flag=True,
    help="Follow log file (like tail -f)"
)
def tail(lines, follow):
    """Show recent log entries."""
    import subprocess

    log_file = "logs/app.log"

    if not os.path.exists(log_file):
        console.print(f"[red]Log file not found: {log_file}[/red]")
        return

    console.print(f"[bold blue]Showing last {lines} lines from {log_file}[/bold blue]")

    try:
        if follow:
            console.print("[dim]Press Ctrl+C to stop following[/dim]\n")
            # Use tail -f equivalent
            cmd = ["tail", "-f", "-n", str(lines), log_file]
        else:
            # Use tail equivalent
            cmd = ["tail", "-n", str(lines), log_file]

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        try:
            if follow:
                # Stream output for follow mode
                for line in iter(process.stdout.readline, ''):
                    console.print(line.rstrip(), highlight=False)
            else:
                # Get all output at once
                stdout, stderr = process.communicate()
                if stdout:
                    console.print(stdout, highlight=False)
                if stderr:
                    console.print(f"[red]{stderr}[/red]")

        except KeyboardInterrupt:
            if follow:
                console.print("\n[yellow]Stopped following log file[/yellow]")
                process.terminate()

    except FileNotFoundError:
        console.print("[red]tail command not found. Showing file content instead:[/red]\n")

        # Fallback: read file directly
        try:
            with open(log_file, 'r') as f:
                all_lines = f.readlines()
                recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

            for line in recent_lines:
                console.print(line.rstrip(), highlight=False)

        except Exception as e:
            console.print(f"[red]Error reading log file: {e}[/red]")


@logs.command()
def json_example():
    """Show example of JSON log format for production."""

    # Example JSON log entry
    example_log = {
        "timestamp": datetime.now().isoformat(),
        "level": "INFO",
        "logger": "app.api.chat",
        "filename": "chat.py",
        "lineno": 45,
        "dd.service": "scribely",
        "dd.env": "production",
        "dd.version": "0.1.0",
        "dd.trace_id": "1234567890123456789",
        "dd.span_id": "9876543210987654",
        "service": "scribely",
        "environment": "production",
        "message": "Chat message processed successfully",
        "extra": {
            "user_id": "user_123",
            "session_id": "session_abc",
            "duration_ms": 150
        }
    }

    # Format JSON for display
    json_str = json.dumps(example_log, indent=2)
    syntax = Syntax(json_str, "json", theme="monokai", line_numbers=True)

    console.print(Panel.fit(
        syntax,
        title="Production JSON Log Example"
    ))

    console.print("\n[bold blue]Key Features:[/bold blue]")
    features = [
        "• Structured JSON format for log aggregators",
        "• DataDog correlation IDs for distributed tracing",
        "• Service metadata for monitoring",
        "• Consistent timestamp format",
        "• Structured extra data for analysis"
    ]

    for feature in features:
        console.print(feature)


@logs.command()
@click.argument("level", type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]))
@click.argument("message")
def send(level, message):
    """Send a test log message at specified level."""

    settings = get_settings()
    setup_logging(settings)
    logger = get_logger("cli_test")

    # Send the log message
    getattr(logger, level.lower())(message)

    console.print(f"[green]✓ Sent {level} message: {message}[/green]")
    console.print(f"[dim]Check console output above and logs/app.log[/dim]")
