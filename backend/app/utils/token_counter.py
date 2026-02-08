"""Token counting utility using LangChain's built-in methods."""
from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel

from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("token_counter")


def count_tokens_llm(model: BaseChatModel, text: str) -> int:
    """
    Count tokens using LangChain model's built-in method.
    
    Works with ANY LangChain model.
    
    Args:
        model: LangChain chat model instance
        text: Text to count tokens for
    
    Returns:
        Number of tokens
    """
    try:
        if hasattr(model, 'get_num_tokens'):
            return model.get_num_tokens(text)
        elif hasattr(model, '_get_encoding'):
            # Fallback: encode → len → decode
            encoding = model._get_encoding(text)
            return len(encoding.encode(text))
        else:
            # Very rough fallback: ~4 characters per token
            return len(text) // 4
    except Exception as e:
        logger.warning(f"Token counting failed, using fallback: {e}")
        # Very rough fallback: ~4 characters per token
        return len(text) // 4


def count_tokens_in_obj(model: BaseChatModel, content: Any) -> int:
    """Count tokens in text, list, or Pydantic objects."""
    try:
        return count_tokens_llm(model, str(content))
    except (TypeError, ValueError):
        return 0


def count_tokens_in_messages(model: BaseChatModel, messages: List[Dict[str, Any]]) -> int:
    """
    Count total tokens in a list of messages.
    
    Counts tokens in all message fields:
    - content (string or list)
    - role (string)
    - name (string)
    - tool_calls (list)
    - tool_call_id (string)
    
    Args:
        model: LangChain chat model instance
        messages: List of message dictionaries with various fields
    
    Returns:
        Total token count
    """
    total_tokens = 0
    for message in messages:
        # Count tokens in common message fields
        keys = ["content", "role", "name", "tool_call_id"]
        for key in keys:
            value = message.get(key)
            if value:
                total_tokens += count_tokens_in_obj(model, value)
        
        # Count tokens in tool_calls if present
        tool_calls = message.get("tool_calls")
        if tool_calls:
            total_tokens += count_tokens_in_obj(model, tool_calls)
    
    return total_tokens


def get_model_context_limit(
    provider: OpenRouterProvider,
    model_name: str,
    use_cache: bool = True
) -> Optional[int]:
    """
    Get model context limit from OpenRouter models cache.
    
    Context length is stored in top_provider.context_length per OpenRouter API.
    
    Args:
        provider: OpenRouterProvider instance
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        use_cache: Whether to use cached models
    
    Returns:
        Context limit if found, None otherwise
    """
    return provider.get_model_context_limit(model_name, use_cache)


def get_model_max_completion(
    provider: OpenRouterProvider,
    model_name: str,
    use_cache: bool = True
) -> Optional[int]:
    """
    Get model max completion tokens from OpenRouter models cache.
    
    Max completion is stored in top_provider.max_completion_tokens per OpenRouter API.
    
    Args:
        provider: OpenRouterProvider instance
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        use_cache: Whether to use cached models
    
    Returns:
        Max completion tokens if found, None otherwise
    """
    return provider.get_model_max_completion(model_name, use_cache)


def get_model_limits(
    provider: OpenRouterProvider,
    model_name: str,
    use_cache: bool = True
) -> Dict[str, Optional[int]]:
    """
    Get both context limit and max completion for a model.
    
    Args:
        provider: OpenRouterProvider instance
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        use_cache: Whether to use cached models
    
    Returns:
        Dict with 'context_length' and 'max_completion_tokens' keys
    """
    return {
        'context_length': get_model_context_limit(provider, model_name, use_cache),
        'max_completion_tokens': get_model_max_completion(provider, model_name, use_cache)
    }


def calculate_safe_context_limit(context_limit: int, buffer_percent: float = 0.1) -> int:
    """
    Calculate safe context limit with buffer.
    
    Args:
        context_limit: Maximum context limit
        buffer_percent: Buffer percentage (default 0.1 = 10%)
    
    Returns:
        Safe context limit (max_context - buffer)
    """
    assert 0 <= buffer_percent <= 1, "Buffer percentage must be between 0 and 1"
    return int(context_limit * (1 - buffer_percent))
