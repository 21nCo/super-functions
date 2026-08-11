"""Shared provider response validation."""

from typing import Any, Dict, cast


def require_object_response(value: Any) -> Dict[str, Any]:
    """Return an HTTP response object or reject an unexpected response shape."""
    if not isinstance(value, dict):
        raise TypeError("Provider API response must be a JSON object")
    return cast(Dict[str, Any], value)
