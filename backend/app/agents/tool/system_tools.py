"""LangChain tools for read-only sandboxed shell operations."""

import asyncio
import os
import tempfile
from pathlib import Path

from langchain_core.tools import StructuredTool

from app.utils.logging import get_logger

logger = get_logger("tool.system")

# Directories the agent is allowed to read from
_ALLOWED_BASE_DIRS = [
    Path.home() / "Documents" / "Scribely",
    Path(tempfile.gettempdir()) / "scribely",
]

# Commands that are safe to run (no writes, no network, no destructive ops)
_ALLOWED_COMMANDS = {
    "grep",
    "find",
    "cat",
    "tail",
    "head",
    "wc",
    "ls",
    "echo",
    "top",
    "touch",
}

_SHELL_TIMEOUT = 10  # seconds


def _is_allowed_path(path_str: str) -> bool:
    """Return True if path is within an allowed base directory."""
    try:
        target = Path(path_str).resolve()
    except Exception:
        return False
    return any(target == base or base in target.parents for base in _ALLOWED_BASE_DIRS)


def build_system_tools() -> list:
    """Return sandboxed read-only shell tools."""

    async def grep_files(pattern: str, path: str) -> str:
        """
        Search for a pattern recursively within an allowed directory.

        Args:
            pattern: Regex or literal string to search for
            path: Directory or file path to search (must be inside ~/Documents/Scribely/)
        """
        if not _is_allowed_path(path):
            return f"Access denied: path '{path}' is outside allowed directories."
        try:
            proc = await asyncio.create_subprocess_exec(
                "grep",
                "-r",
                "--include=*.json",
                "--include=*.txt",
                "-n",
                pattern,
                path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_SHELL_TIMEOUT
            )
            output = stdout.decode(errors="replace").strip()
            return output if output else f"No matches found for '{pattern}' in {path}."
        except asyncio.TimeoutError:
            return "Command timed out."
        except Exception as e:
            return f"Error running grep: {e}"

    async def list_files(path: str) -> str:
        """
        List files in an allowed directory.

        Args:
            path: Directory path to list (must be inside ~/Documents/Scribely/)
        """
        if not _is_allowed_path(path):
            return f"Access denied: path '{path}' is outside allowed directories."
        try:
            proc = await asyncio.create_subprocess_exec(
                "ls",
                "-lh",
                path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=_SHELL_TIMEOUT
            )
            return stdout.decode(errors="replace").strip() or "Directory is empty."
        except asyncio.TimeoutError:
            return "Command timed out."
        except Exception as e:
            return f"Error listing files: {e}"

    async def read_file(path: str) -> str:
        """
        Read the contents of a file (transcripts, logs, etc.).

        Args:
            path: Absolute path to the file (must be inside ~/Documents/Scribely/)
        """
        if not _is_allowed_path(path):
            return f"Access denied: path '{path}' is outside allowed directories."
        try:
            import aiofiles

            async with aiofiles.open(path, "r", errors="replace") as f:
                content = await f.read()
            # Truncate large files to avoid flooding the context
            if len(content) > 8000:
                content = (
                    content[:8000] + f"\n... [truncated, file is {len(content)} chars]"
                )
            return content
        except FileNotFoundError:
            return f"File not found: {path}"
        except Exception as e:
            return f"Error reading file: {e}"

    async def run_shell_command(command: str) -> str:
        """
        Run a safe, read-only shell command. Allowed commands: grep, find, cat, tail,
        head, wc, ls, echo. No writes or destructive operations permitted.

        Args:
            command: Shell command string (e.g. 'tail -n 50 /path/to/file.log')
        """
        parts = command.strip().split()
        if not parts:
            return "Empty command."

        cmd_name = os.path.basename(parts[0])
        if cmd_name not in _ALLOWED_COMMANDS:
            return (
                f"Command '{cmd_name}' is not allowed. "
                f"Permitted commands: {', '.join(sorted(_ALLOWED_COMMANDS))}"
            )

        # Block dangerous flags
        dangerous_flags = {">", ">>", "|", ";", "&&", "||", "`", "$", "rm", "mv", "cp"}
        if any(flag in parts for flag in dangerous_flags):
            return "Command contains disallowed operators or flags."

        # Validate any path arguments
        for part in parts[1:]:
            if part.startswith("/") or part.startswith("~"):
                resolved = str(Path(part).expanduser())
                if not _is_allowed_path(resolved):
                    return (
                        f"Access denied: path '{part}' is outside allowed directories."
                    )

        try:
            proc = await asyncio.create_subprocess_exec(
                *parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_SHELL_TIMEOUT
            )
            output = stdout.decode(errors="replace").strip()
            err = stderr.decode(errors="replace").strip()
            if output:
                return output[:8000]
            if err:
                return f"stderr: {err[:2000]}"
            return "(no output)"
        except asyncio.TimeoutError:
            return "Command timed out."
        except Exception as e:
            return f"Error running command: {e}"

    return [
        StructuredTool.from_function(
            coroutine=grep_files,
            name="grep_files",
            description="Search for a text pattern in meeting files. Sandboxed to ~/Documents/Scribely/.",
        ),
        StructuredTool.from_function(
            coroutine=list_files,
            name="list_files",
            description="List files in an allowed directory (~/Documents/Scribely/).",
        ),
        StructuredTool.from_function(
            coroutine=read_file,
            name="read_file",
            description="Read a file's contents. Sandboxed to ~/Documents/Scribely/.",
        ),
        StructuredTool.from_function(
            coroutine=run_shell_command,
            name="run_shell_command",
            description=(
                "Run a safe read-only shell command (grep, find, cat, tail, head, wc, ls, echo). "
                "No writes or destructive operations allowed."
            ),
        ),
    ]
