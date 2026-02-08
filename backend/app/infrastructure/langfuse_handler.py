"""Langfuse integration for LLM observability."""
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger("langfuse_handler")

# Global Langfuse handler instance
_langfuse_handler = None


def get_langfuse_handler(force_new: bool = False):
    """
    Get or create Langfuse callback handler for LangChain.
    
    This function initializes Langfuse if enabled in settings and returns a CallbackHandler
    that can be used with LangChain chains. Configure via settings:
    - langfuse_enabled: Enable/disable Langfuse
    - langfuse_secret_key: Langfuse secret key
    - langfuse_public_key: Langfuse public key
    - langfuse_base_url: Langfuse host URL
    
    Args:
        force_new: If True, create a new handler even if one exists
        
    Returns:
        Langfuse CallbackHandler instance if Langfuse is enabled, None otherwise
        
    Example:
        ```python
        from app.infrastructure.langfuse_handler import get_langfuse_handler
        
        handler = get_langfuse_handler()
        if handler:
            llm = provider.get_llm(callbacks=[handler])
        ```
    """
    global _langfuse_handler
    
    settings = get_settings()
    
    # Check if Langfuse is enabled via settings
    if not settings.langfuse_enabled:
        return None
    
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        logger.warning(
            "Langfuse is enabled but langfuse_secret_key or langfuse_public_key is not set. "
            "Skipping Langfuse integration."
        )
        return None
    
    # Return cached handler if exists and not forcing new
    if _langfuse_handler is not None and not force_new:
        return _langfuse_handler
    
    try:
        from langfuse import Langfuse
        from langfuse.langchain import CallbackHandler
        
        # Initialize Langfuse client with settings
        _langfuse_client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_base_url,
        )
        logger.info(
            f"Langfuse initialized with host: {settings.langfuse_base_url}"
        )
        
        # Create callback handler
        # CallbackHandler automatically uses the initialized Langfuse client
        _langfuse_handler = CallbackHandler()
        logger.debug("Langfuse callback handler created")
        
        return _langfuse_handler
        
    except ImportError:
        logger.warning(
            "Langfuse package not installed. Install it with: pip install langfuse"
        )
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Langfuse: {e}")
        return None


def get_langfuse_callbacks(additional_callbacks: Optional[List] = None) -> List:
    """
    Get list of Langfuse callbacks, optionally combined with additional callbacks.
    
    Args:
        additional_callbacks: Optional list of additional callback handlers
        
    Returns:
        List of callback handlers (includes Langfuse if enabled)
        
    Example:
        ```python
        from app.infrastructure.langfuse_handler import get_langfuse_callbacks
        
        callbacks = get_langfuse_callbacks()
        llm = provider.get_llm(callbacks=callbacks)
        ```
    """
    callbacks = []
    
    # Add Langfuse handler if enabled
    langfuse_handler = get_langfuse_handler()
    if langfuse_handler:
        callbacks.append(langfuse_handler)
    
    # Add additional callbacks if provided
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
    
    # Merge custom metadata
    if metadata:
        langfuse_metadata.update(metadata)
    
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
