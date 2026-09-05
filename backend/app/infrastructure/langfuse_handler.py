"""Langfuse integration for LLM observability."""

import logging
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("langfuse_handler")


def _stringify_langfuse_metadata_values(
    metadata: Dict[str, Any],
) -> Dict[str, str]:
    """Langfuse propagate_attributes expects string values in the metadata map."""
    out: Dict[str, str] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        out[str(key)] = value if isinstance(value, str) else str(value)
    return out


class _SuppressOtelDetachMismatchFilter(logging.Filter):
    """Avoid ERROR spam when LangChain async runs Langfuse callbacks across task boundaries."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "Failed to detach context" in msg:
            return False
        return True


def configure_langfuse_observability_logging() -> None:
    """
    Langfuse LangChain CallbackHandler uses OpenTelemetry attach/detach around
    propagate_attributes; LangChain may invoke chain end in a different asyncio
    context than chain start, so detach can raise ValueError. OpenTelemetry logs
    that at ERROR even though it is already handled — filter only that line.
    """
    if getattr(configure_langfuse_observability_logging, "_done", False):
        return
    logging.getLogger("opentelemetry.context").addFilter(
        _SuppressOtelDetachMismatchFilter()
    )
    setattr(configure_langfuse_observability_logging, "_done", True)


# Global Langfuse handler instance
_langfuse_handler = None


def _ensure_langfuse_client():
    """Ensure the Langfuse client is initialized (singleton). Returns True if ready."""
    settings = get_settings()

    if not settings.langfuse_enabled:
        return False

    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        logger.warning(
            "Langfuse is enabled but langfuse_secret_key or langfuse_public_key is not set. "
            "Skipping Langfuse integration."
        )
        return False

    configure_langfuse_observability_logging()

    try:
        from langfuse import Langfuse

        Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_base_url,
        )
        return True
    except ImportError:
        logger.warning(
            "Langfuse package not installed. Install it with: pip install langfuse"
        )
        return False
    except Exception as e:
        logger.error(f"Failed to initialize Langfuse: {e}")
        return False


def get_langfuse_handler(force_new: bool = False):
    """
    Get or create Langfuse callback handler for LangChain.

    A fresh ``CallbackHandler`` is created per call by default to avoid
    OpenTelemetry context-token conflicts across async boundaries.  Pass
    ``force_new=False`` only when you are certain the handler will be used
    in the same async context it was created in.

    Configure via settings:
    - langfuse_enabled: Enable/disable Langfuse
    - langfuse_secret_key: Langfuse secret key
    - langfuse_public_key: Langfuse public key
    - langfuse_base_url: Langfuse host URL

    Args:
        force_new: If True, create a new handler even if one exists.
            Defaults to False for backward compat, but
            ``get_langfuse_callbacks`` always creates a fresh handler.

    Returns:
        Langfuse CallbackHandler instance if Langfuse is enabled, None otherwise
    """
    global _langfuse_handler

    if not _ensure_langfuse_client():
        return None

    if _langfuse_handler is not None and not force_new:
        return _langfuse_handler

    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
        _langfuse_handler = handler
        logger.debug("Langfuse callback handler created")
        return handler
    except ImportError:
        return None
    except Exception as e:
        logger.error(f"Failed to create Langfuse handler: {e}")
        return None


def get_langfuse_callbacks(additional_callbacks: Optional[List] = None) -> List:
    """
    Get list of Langfuse callbacks, optionally combined with additional callbacks.

    A **fresh** ``CallbackHandler`` is created on every call so that each
    LangChain invocation gets its own OpenTelemetry context, avoiding the
    ``"Token was created in a different Context"`` error that occurs when a
    singleton handler is shared across async boundaries.

    Args:
        additional_callbacks: Optional list of additional callback handlers

    Returns:
        List of callback handlers (includes Langfuse if enabled)
    """
    callbacks = []

    langfuse_handler = get_langfuse_handler(force_new=True)
    if langfuse_handler:
        callbacks.append(langfuse_handler)

    if additional_callbacks:
        callbacks.extend(additional_callbacks)

    return callbacks if callbacks else None


def get_langfuse_config(
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    callbacks: Optional[List] = None,
    run_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build LangChain config dict with Langfuse filtering attributes.

    This helper makes it easy to add Langfuse filtering attributes (session_id,
    user_id, tags, metadata) to your LangChain invocations for better filtering
    and organization in Langfuse.

    Args:
        session_id: Session identifier to group related traces (e.g., chat session ID)
        user_id: User identifier for user-level filtering
        tags: List of tags for custom labeling (e.g., ["prod", "chat", "v2"])
        metadata: Custom metadata dictionary (merged with Langfuse-specific keys)
        callbacks: Optional list of callback handlers (Langfuse is added automatically)
        run_name: Optional name for the trace/run

    Returns:
        LangChain config dictionary ready to use with chain.invoke() or chain.ainvoke()

    Example:
        ```python
        from app.infrastructure.langfuse_handler import get_langfuse_config

        # Build config with filtering attributes
        config = get_langfuse_config(
            session_id="chat-session-123",
            user_id="user_456",
            tags=["production", "chat"],
            metadata={"request_id": "req-789"}
        )

        # Use with chain invocation
        response = chain.invoke({"input": "Hello"}, config=config)
        ```
    """
    config: Dict[str, Any] = {}

    # Build metadata dict with Langfuse-specific keys
    langfuse_metadata: Dict[str, Any] = {}

    if session_id:
        langfuse_metadata["langfuse_session_id"] = session_id

    if user_id:
        langfuse_metadata["langfuse_user_id"] = user_id

    if tags:
        langfuse_metadata["langfuse_tags"] = tags

    # Merge custom metadata (string values only — Langfuse propagate_attributes)
    if metadata:
        langfuse_metadata.update(_stringify_langfuse_metadata_values(metadata))

    if langfuse_metadata:
        config["metadata"] = langfuse_metadata

    # Add callbacks (includes Langfuse if enabled)
    final_callbacks = get_langfuse_callbacks(callbacks)
    if final_callbacks:
        config["callbacks"] = final_callbacks

    # Add run name if provided
    if run_name:
        config["run_name"] = run_name

    return config


def flush_langfuse():
    """Flush pending Langfuse events. Useful before application shutdown."""
    try:
        from langfuse import get_client

        client = get_client()
        if client:
            client.flush()
            logger.debug("Langfuse events flushed")
    except Exception as e:
        logger.warning(f"Failed to flush Langfuse events: {e}")


def shutdown_langfuse():
    """Shutdown Langfuse client gracefully."""
    global _langfuse_handler

    try:
        from langfuse import get_client

        client = get_client()
        if client:
            client.shutdown()
            logger.info("Langfuse client shut down")
    except Exception as e:
        logger.warning(f"Failed to shutdown Langfuse client: {e}")
    finally:
        _langfuse_handler = None
