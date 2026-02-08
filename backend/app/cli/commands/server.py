"""
Server management commands.
"""

import subprocess
import sys

import click
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()


@click.group()
def server():
    """Manage server operations."""


@server.command()
@click.option(
    "--host",
    default="0.0.0.0",
    help="Host to bind to"
)
@click.option(
    "--port", "-p",
    default=8000,
    type=int,
    help="Port to bind to"
)
@click.option(
    "--reload",
    is_flag=True,
    help="Enable auto-reload for development"
)
@click.option(
    "--workers",
    default=1,
    type=int,
    help="Number of worker processes"
)
def start(host, port, reload, workers):
    """Start the FastAPI server."""
    console.print(Panel.fit(
        f"[bold green]Starting AssistMe Server[/bold green]\n"
        f"Host: {host}:{port}\n"
        f"Reload: {'✓' if reload else '✗'}\n"
        f"Workers: {workers}",
        title="Server Configuration"
    ))

    try:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=reload,
            workers=workers if not reload else 1,  # reload doesn't work with multiple workers
            log_config=None  # We'll use our rich logging
        )
    except KeyboardInterrupt:
        console.print("\n[yellow]Server stopped by user[/yellow]")
    except Exception as e:
        console.print(f"[red]Server error: {e}[/red]")
        sys.exit(1)


@server.command()
def status():
    """Check server status."""
    import httpx

    try:
        response = httpx.get("http://localhost:8000/api/v1/health", timeout=5.0)
        if response.status_code == 200:
            data = response.json()

            table = Table(title="Server Status")
            table.add_column("Component", style="cyan")
            table.add_column("Status", style="green")
            table.add_column("Details", style="yellow")

            table.add_row("API", "✓ Online", f"Response time: {response.elapsed.total_seconds():.2f}s")

            for service, status in data.get("services", {}).items():
                table.add_row(
                    service.title(),
                    "✓ Healthy" if status.get("healthy", False) else "✗ Unhealthy",
                    status.get("details", "N/A")
                )

            console.print(table)
        else:
            console.print(f"[red]Server returned status code: {response.status_code}[/red]")

    except httpx.ConnectError:
        console.print("[red]✗ Server is not running or not accessible[/red]")
    except Exception as e:
        console.print(f"[red]Error checking status: {e}[/red]")


@server.command()
def stop():
    """Stop running server processes."""
    try:
        # Find and kill uvicorn processes
        result = subprocess.run(
            ["pkill", "-f", "uvicorn.*app.main:app"],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            console.print("[green]✓ Server processes stopped[/green]")
        else:
            console.print("[yellow]No running server processes found[/yellow]")

    except Exception as e:
        console.print(f"[red]Error stopping server: {e}[/red]")
