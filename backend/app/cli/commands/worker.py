"""
Celery worker management commands.
"""

import os
import subprocess
import time
from pathlib import Path
from typing import Optional

import click
import psutil
from app.config import get_settings
from app.utils.logging import (
    get_logger,
    print_error,
    print_info,
    print_success,
    print_warning,
)
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

console = Console()
logger = get_logger("worker_cli")
settings = get_settings()


@click.group()
def worker():
    """Celery worker management commands."""


@worker.command()
@click.option("--queues", "-q", default="general,chat,llm", help="Queues to process (comma-separated)")
@click.option("--concurrency", "-c", default=2, type=int, help="Number of worker processes")
@click.option("--loglevel", "-l", default="INFO", help="Log level")
@click.option("--pool", "-P", default="prefork", help="Pool implementation")
@click.option("--detach", "-d", is_flag=True, help="Run worker in background")
@click.option("--pidfile", help="Path to PID file for background worker")
@click.option("--logfile", help="Path to log file for background worker")
def start(queues: str, concurrency: int, loglevel: str, pool: str, detach: bool, pidfile: Optional[str], logfile: Optional[str]):
    """Start Celery worker."""
    try:
        print_info(f"Starting Celery worker...")

        # Build command
        cmd = [
            "celery",
            "-A", "app.core.celery_app:celery_app",
            "worker",
            "--queues", queues,
            "--concurrency", str(concurrency),
            "--loglevel", loglevel,
            "--pool", pool
        ]

        if detach:
            cmd.append("--detach")

            if pidfile:
                cmd.extend(["--pidfile", pidfile])
            else:
                pidfile = f"/tmp/celery_worker_{os.getpid()}.pid"
                cmd.extend(["--pidfile", pidfile])

            if logfile:
                cmd.extend(["--logfile", logfile])
            else:
                logfile = f"/tmp/celery_worker_{os.getpid()}.log"
                cmd.extend(["--logfile", logfile])

        console.print(Panel.fit(
            f"[bold blue]Starting Celery Worker[/bold blue]\n\n"
            f"Queues: [bold]{queues}[/bold]\n"
            f"Concurrency: [bold]{concurrency}[/bold]\n"
            f"Pool: [bold]{pool}[/bold]\n"
            f"Log Level: [bold]{loglevel}[/bold]" +
            (f"\nPID File: [bold]{pidfile}[/bold]\nLog File: [bold]{logfile}[/bold]" if detach else ""),
            title="Worker Configuration"
        ))

        if detach:
            # Run in background
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(2)  # Wait a bit to see if it starts successfully

            if process.poll() is None:  # Process is still running
                print_success(f"Worker started in background (PID file: {pidfile})")
                print_info("Use 'worker status' to check worker status")
                print_info("Use 'worker stop' to stop the worker")
            else:
                print_error("Worker failed to start in background")
                return False
        else:
            # Run in foreground
            print_info("Starting worker in foreground... (Ctrl+C to stop)")
            try:
                subprocess.run(cmd, check=True)
            except KeyboardInterrupt:
                print_info("\nWorker stopped by user")
            except subprocess.CalledProcessError as e:
                print_error(f"Worker failed: {e}")
                return False

        return True

    except Exception as e:
        print_error(f"Error starting worker: {str(e)}")
        logger.error(f"Worker start error: {str(e)}")
        return False


@worker.command()
@click.option("--pidfile", help="Path to PID file")
@click.option("--force", "-f", is_flag=True, help="Force stop (SIGKILL)")
def stop(pidfile: Optional[str], force: bool):
    """Stop Celery worker."""
    try:
        if pidfile and Path(pidfile).exists():
            # Stop using PID file
            with open(pidfile, 'r') as f:
                pid = int(f.read().strip())

            try:
                process = psutil.Process(pid)
                if force:
                    process.kill()  # SIGKILL
                    print_success(f"Worker forcefully stopped (PID: {pid})")
                else:
                    process.terminate()  # SIGTERM
                    print_success(f"Worker stopped gracefully (PID: {pid})")

                # Remove PID file
                Path(pidfile).unlink()

            except psutil.NoSuchProcess:
                print_warning(f"Process {pid} not found, removing stale PID file")
                Path(pidfile).unlink()
            except psutil.AccessDenied:
                print_error(f"Permission denied stopping process {pid}")
                return False

        else:
            # Try to find and stop Celery workers
            stopped_count = 0
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = ' '.join(proc.info['cmdline'] or [])
                    if 'celery' in cmdline and 'worker' in cmdline and 'app.core.celery_app' in cmdline:
                        if force:
                            proc.kill()
                        else:
                            proc.terminate()
                        print_info(f"Stopped worker process {proc.info['pid']}")
                        stopped_count += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            if stopped_count > 0:
                print_success(f"Stopped {stopped_count} worker process(es)")
            else:
                print_warning("No running workers found")

        return True

    except Exception as e:
        print_error(f"Error stopping worker: {str(e)}")
        logger.error(f"Worker stop error: {str(e)}")
        return False


@worker.command()
def status():
    """Show worker status and statistics."""
    try:
        print_info("Checking Celery worker status...")

        # Find running workers
        workers = []
        for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cpu_percent', 'memory_info', 'create_time']):
            try:
                cmdline = ' '.join(proc.info['cmdline'] or [])
                if 'celery' in cmdline and 'worker' in cmdline and 'app.core.celery_app' in cmdline:
                    # Extract queue information
                    queues = "unknown"
                    if '--queues' in proc.info['cmdline']:
                        queue_idx = proc.info['cmdline'].index('--queues')
                        if queue_idx + 1 < len(proc.info['cmdline']):
                            queues = proc.info['cmdline'][queue_idx + 1]

                    workers.append({
                        'pid': proc.info['pid'],
                        'cpu_percent': proc.cpu_percent(),
                        'memory_mb': proc.info['memory_info'].rss // 1024 // 1024,
                        'uptime': time.time() - proc.info['create_time'],
                        'queues': queues,
                        'status': proc.status()
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        if not workers:
            print_warning("No running Celery workers found")
            return

        # Create status table
        table = Table(title="Celery Worker Status")
        table.add_column("PID", style="cyan")
        table.add_column("Status", style="green")
        table.add_column("Queues", style="yellow")
        table.add_column("CPU %", style="blue")
        table.add_column("Memory (MB)", style="magenta")
        table.add_column("Uptime", style="white")

        for worker in workers:
            uptime_str = f"{int(worker['uptime'] // 3600)}h {int((worker['uptime'] % 3600) // 60)}m"
            table.add_row(
                str(worker['pid']),
                worker['status'],
                worker['queues'],
                f"{worker['cpu_percent']:.1f}",
                str(worker['memory_mb']),
                uptime_str
            )

        console.print(table)
        print_success(f"Found {len(workers)} running worker(s)")

        return True

    except Exception as e:
        print_error(f"Error checking worker status: {str(e)}")
        logger.error(f"Worker status error: {str(e)}")
        return False


@worker.command()
@click.option("--queue", "-q", default="general", help="Queue to inspect")
def inspect(queue: str):
    """Inspect worker and queue statistics."""
    try:
        print_info(f"Inspecting queue: {queue}")

        # This would use Celery's inspect functionality
        cmd = [
            "celery",
            "-A", "app.core.celery_app:celery_app",
            "inspect",
            "stats"
        ]

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            task = progress.add_task(description="Gathering worker statistics...", total=None)

            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

                if result.returncode == 0:
                    print_success("Worker inspection completed")
                    console.print(Panel(result.stdout, title=f"Queue: {queue}", expand=False))
                else:
                    print_error(f"Inspection failed: {result.stderr}")
                    return False

            except subprocess.TimeoutExpired:
                print_warning("Inspection timed out - workers may not be responding")
                return False

        return True

    except Exception as e:
        print_error(f"Error inspecting workers: {str(e)}")
        logger.error(f"Worker inspection error: {str(e)}")
        return False


@worker.command()
def purge():
    """Purge all pending tasks from queues."""
    try:
        print_warning("This will remove ALL pending tasks from ALL queues!")
        if not click.confirm("Are you sure you want to continue?"):
            print_info("Operation cancelled")
            return True

        cmd = [
            "celery",
            "-A", "app.core.celery_app:celery_app",
            "purge",
            "-f"  # Force without confirmation
        ]

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            task = progress.add_task(description="Purging task queues...", total=None)

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                print_success("All task queues purged successfully")
                console.print(result.stdout)
            else:
                print_error(f"Purge failed: {result.stderr}")
                return False

        return True

    except Exception as e:
        print_error(f"Error purging queues: {str(e)}")
        logger.error(f"Queue purge error: {str(e)}")
        return False


@worker.command()
@click.option("--task", "-t", help="Task name/pattern to monitor")
@click.option("--refresh", "-r", default=5, type=int, help="Refresh interval in seconds")
def monitor(task: Optional[str], refresh: int):
    """Monitor worker activity in real-time."""
    try:
        print_info("Starting worker monitor... (Ctrl+C to stop)")

        cmd = ["celery", "-A", "app.core.celery_app:celery_app", "events"]

        if task:
            print_info(f"Monitoring tasks matching: {task}")

        print_info(f"Refresh interval: {refresh} seconds")
        print_info("Press Ctrl+C to stop monitoring")

        try:
            subprocess.run(cmd, check=True)
        except KeyboardInterrupt:
            print_info("\nMonitoring stopped by user")
        except subprocess.CalledProcessError as e:
            print_error(f"Monitor failed: {e}")
            return False

        return True

    except Exception as e:
        print_error(f"Error starting monitor: {str(e)}")
        logger.error(f"Worker monitor error: {str(e)}")
        return False
