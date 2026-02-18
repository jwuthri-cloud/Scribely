"""
CLI command router for Scribely.
"""

from .commands import cache, database, health, llm, logs, server, setup, training, worker


def setup_commands(cli):
    """Register all CLI commands with the main CLI group."""

    # Add command groups
    cli.add_command(server.server)
    cli.add_command(database.database)
    cli.add_command(health.health)
    cli.add_command(setup.setup)
    cli.add_command(llm.llm)
    cli.add_command(cache.cache)
    cli.add_command(logs.logs)
    cli.add_command(worker.worker)
    cli.add_command(training.training)
