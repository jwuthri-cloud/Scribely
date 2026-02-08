"""LangChain tracing integration with LangSmith."""
import os
from typing import Optional

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("langchain_tracing")

# Track if we've already initialized to avoid duplicate initialization
_initialized = False


def initialize_langchain_tracing(force: bool = False):
    """
    Initialize LangChain tracing with LangSmith.
    
    LangChain tracing works via environment variables that LangChain automatically
    picks up. This function sets those environment variables from application settings.
    
    Configure via settings:
    - langsmith_tracing: Enable/disable LangSmith tracing (LANGSMITH_TRACING)
    - langsmith_endpoint: LangSmith API endpoint (LANGSMITH_ENDPOINT)
    - langsmith_api_key: LangSmith API key (LANGSMITH_API_KEY)
    - langsmith_project: Project name for traces (LANGSMITH_PROJECT)
    
    Args:
        force: If True, reinitialize even if already initialized
    
    Returns:
        True if tracing was initialized, False otherwise
        
    Example:
        ```python
        from app.infrastructure.langchain_tracing import initialize_langchain_tracing
        
        # Initialize at app startup (or it will auto-initialize on import)
        initialize_langchain_tracing()
        ```
    """
    global _initialized
    
    # Skip if already initialized (unless forced)
    if _initialized and not force:
        return True
    
    try:
        settings = get_settings()
    except Exception as e:
        logger.debug(f"Settings not available yet: {e}")
        return False
    
    # Check if tracing is enabled
    if not settings.langsmith_tracing:
        logger.debug("LangSmith tracing is disabled")
        return False
    
    # Validate required settings
    if not settings.langsmith_api_key:
        logger.warning(
            "LangSmith tracing is enabled but langsmith_api_key is not set. "
            "Skipping LangSmith tracing initialization."
        )
        return False
    
    if not settings.langsmith_project:
        logger.warning(
            "LangSmith tracing is enabled but langsmith_project is not set. "
            "Using default project name."
        )
        # Use app name as default project if not set
        project_name = settings.app_name or "langchain-project"
    else:
        project_name = settings.langsmith_project
    
    try:
        # Set environment variables for LangSmith tracing
        # LangChain automatically reads these when making calls
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint
        os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGSMITH_PROJECT"] = project_name
        
        logger.info(
            f"LangSmith tracing initialized: endpoint={settings.langsmith_endpoint}, "
            f"project={project_name}"
        )
        _initialized = True
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize LangSmith tracing: {e}")
        return False


def disable_langchain_tracing():
    """Disable LangSmith tracing by unsetting environment variables."""
    global _initialized
    
    try:
        os.environ.pop("LANGSMITH_TRACING", None)
        os.environ.pop("LANGSMITH_ENDPOINT", None)
        os.environ.pop("LANGSMITH_API_KEY", None)
        os.environ.pop("LANGSMITH_PROJECT", None)
        _initialized = False
        logger.info("LangSmith tracing disabled")
    except Exception as e:
        logger.warning(f"Failed to disable LangChain tracing: {e}")


# Auto-initialize on module import (works for scripts, CLI, etc.)
# This ensures tracing works even when not running through FastAPI
try:
    initialize_langchain_tracing()
except Exception:
    # Silently fail if settings aren't available yet (e.g., during import)
    # It will be initialized later when settings are loaded
    pass
