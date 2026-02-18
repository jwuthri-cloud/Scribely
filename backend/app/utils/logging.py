"""
Logging utilities for Scribely.
Enhanced with Rich for beautiful console output and JSON for production.
"""
import logging
from typing import Optional

from rich.console import Console
from rich.logging import RichHandler
from rich.traceback import install as install_rich_traceback

# Global rich console instance
console = Console()

# Install rich traceback for better error display
install_rich_traceback(show_locals=True)

# Global logger instance
_logger: Optional[logging.Logger] = None


def setup_logging(log_level: str = "INFO", environment: str = "development"):
    """Simple Rich logging setup."""
    global _logger

    # Just use Rich for everything - keep it simple!
    FORMAT = "%(message)s"
    logging.basicConfig(
        level=log_level.upper(),
        format=FORMAT,
        datefmt="<%d %b %Y | %H:%M:%S>",
        handlers=[
            RichHandler(
                rich_tracebacks=True,
                tracebacks_show_locals=True,
                show_time=True,
                show_level=True,
                show_path=True,
                markup=True,
            )
        ],
        force=True  # Override any existing config
    )

    # Configure uvicorn to use our Rich handler
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        logger = logging.getLogger(logger_name)
        logger.handlers.clear()
        logger.propagate = True

    # Set global logger
    _logger = logging.getLogger("app")


def setup_cli_logging(level: str = "INFO", verbose: bool = False):
    """Simple CLI Rich logging setup."""
    global _logger

    if verbose:
        level = "DEBUG"

    # Just use Rich for CLI too - keep it simple!
    FORMAT = "%(message)s"
    logging.basicConfig(
        level=level,
        format=FORMAT,
        datefmt="<%d %b %Y | %H:%M:%S>",
        handlers=[
            RichHandler(
                rich_tracebacks=True,
                tracebacks_show_locals=verbose,
                show_time=False,
                show_level=True,
                show_path=verbose,
                markup=True,
            )
        ],
        force=True
    )

    # Set global logger
    _logger = logging.getLogger("cli")


def get_logger(name: str = None) -> logging.Logger:
    """Get a logger instance."""
    if name:
        return logging.getLogger(f"app.{name}")
    return _logger or logging.getLogger("app")


def get_rich_console() -> Console:
    """Get the global Rich console instance."""
    return console


def print_success(message: str):
    """Print success message with rich formatting."""
    console.print(f"[bold green]✓[/bold green] {message}")


def print_error(message: str):
    """Print error message with rich formatting."""
    console.print(f"[bold red]✗[/bold red] {message}")


def print_warning(message: str):
    """Print warning message with rich formatting."""
    console.print(f"[bold yellow]⚠[/bold yellow] {message}")


def print_info(message: str):
    """Print info message with rich formatting."""
    console.print(f"[bold blue]ℹ[/bold blue] {message}")


def print_debug(message: str):
    """Print debug message with rich formatting."""
    console.print(f"[dim]🐛 {message}[/dim]")
