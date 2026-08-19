"""Shared provider response validation."""

from typing import Any, Dict, cast


def require_object_response(value: Any) -> Dict[str, Any]:
    """Validate custom action-context HTTP clients as well as the built-in client."""
    if not isinstance(value, dict):
        raise TypeError("Provider API response must be a JSON object")
    return cast(Dict[str, Any], value)
