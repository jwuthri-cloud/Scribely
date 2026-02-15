"""
Helper utilities for Scribely.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict


def generate_id() -> str:
    """Generate a unique identifier."""
    return str(uuid.uuid4())


def generate_short_id(length: int = 8) -> str:
    """Generate a short unique identifier."""
    return str(uuid.uuid4()).replace("-", "")[:length]


def hash_string(text: str) -> str:
    """Generate a hash of a string."""
    return hashlib.sha256(text.encode()).hexdigest()


def get_timestamp() -> str:
    """Get current timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename for safe usage."""
    import re

    # Remove special characters and replace spaces with underscores
    sanitized = re.sub(r'[^\w\-_\.]', '_', filename)
    return sanitized


def truncate_text(text: str, max_length: int, suffix: str = "...") -> str:
    """Truncate text to a maximum length."""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format."""
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_names[i]}"


def mask_sensitive_data(data: str, visible_chars: int = 4) -> str:
    """Mask sensitive data showing only first few characters."""
    if len(data) <= visible_chars:
        return "*" * len(data)
    return data[:visible_chars] + "*" * (len(data) - visible_chars)


def dict_to_query_string(params: Dict[str, Any]) -> str:
    """Convert dictionary to query string."""
    from urllib.parse import urlencode
    return urlencode(params)


def deep_merge_dicts(dict1: Dict[str, Any], dict2: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge two dictionaries."""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge_dicts(result[key], value)
        else:
            result[key] = value
    return result


def extract_error_message(error: Exception) -> str:
    """Extract a clean error message from an exception."""
    error_msg = str(error)
    if not error_msg:
        error_msg = type(error).__name__
    return error_msg


def is_valid_uuid(uuid_string: str) -> bool:
    """Check if a string is a valid UUID."""
    try:
        uuid.UUID(uuid_string)
        return True
    except (ValueError, TypeError):
        return False
