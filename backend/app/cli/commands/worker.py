"""
Legacy Celery worker commands.

This project does not ship a Celery app (`app.core.celery_app` was removed).
Background work uses FastAPI/asyncio (see ``app.services.task_runner``).
These commands remain as stubs so existing scripts fail loudly with an explanation
instead of obscure import errors.
"""

import click

from app.utils.logging import print_info, print_warning


def _celery_not_configured() -> None:
    print_warning(
        "Celery is not configured for this codebase. "
        "Meeting processing and related work run via FastAPI background tasks, not Celery workers."
    )
    print_info(
        "If you need distributed task execution, add a Celery application module "
        "and point these commands at it, or use another orchestrator."
    )


@click.group()
def worker():
    """Deprecated: Celery worker management (not used in this project)."""


@worker.command()
@click.option("--queues", "-q", default="general,chat,llm", help="(ignored)")
@click.option("--concurrency", "-c", default=2, type=int, help="(ignored)")
@click.option("--loglevel", "-l", default="INFO", help="(ignored)")
@click.option("--pool", "-P", default="prefork", help="(ignored)")
@click.option("--detach", "-d", is_flag=True, help="(ignored)")
@click.option("--pidfile", help="(ignored)")
@click.option("--logfile", help="(ignored)")
def start(**_kwargs):
    """Start Celery worker (disabled)."""
    _celery_not_configured()


@worker.command()
@click.option("--pidfile", help="(ignored)")
@click.option("--force", "-f", is_flag=True, help="(ignored)")
def stop(**_kwargs):
    """Stop Celery worker (disabled)."""
    _celery_not_configured()


@worker.command()
def status():
    """Show Celery worker status (disabled)."""
    _celery_not_configured()


@worker.command()
@click.option("--queue", "-q", default="general", help="(ignored)")
def inspect(**_kwargs):
    """Inspect Celery workers (disabled)."""
    _celery_not_configured()


@worker.command()
def purge():
    """Purge Celery queues (disabled)."""
    _celery_not_configured()


@worker.command()
@click.option("--task", "-t", help="(ignored)")
@click.option("--refresh", "-r", default=5, type=int, help="(ignored)")
def monitor(**_kwargs):
    """Monitor Celery workers (disabled)."""
    _celery_not_configured()
