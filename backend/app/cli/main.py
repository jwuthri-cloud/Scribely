"""
Main CLI entry point for Scribely.
"""

import click
from rich.console import Console

from ..utils.logging import setup_cli_logging
from .router import setup_commands

console = Console()


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose output")
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
    help="Set log level",
)
@click.pass_context
def cli(ctx, verbose, log_level):
    """Scribely CLI - Manage your AI-powered backend."""

    # Ensure context object exists
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["log_level"] = log_level

    # Setup logging for CLI
    setup_cli_logging(log_level, verbose)

    if verbose:
        console.print(f"[bold green]Scribely CLI initialized[/bold green]")


# Setup all commands
setup_commands(cli)


if __name__ == "__main__":
    cli()
