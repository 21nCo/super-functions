"""Observability helpers for authfn Python."""

from __future__ import annotations

import secrets
from typing import Any, Dict

from .types import AuthFnConfig, AuthFnEvent

_REQUEST_ID_ATTR = "_authfn_request_id"
_REDACTED = "[redacted]"
_SENSITIVE_KEY_PARTS = (
    "password",
    "secret",
    "token",
    "code",
    "hash",
    "access",
    "refresh",
    "idtoken",
    "clientsecret",
)


def create_request_id() -> str:
    """Create a stable authfn request id."""

    return f"req_{secrets.token_hex(5)}"


def resolve_request_id(request: Any) -> str:
    """Resolve or attach a stable request id for the current request object."""

    cached = getattr(request, _REQUEST_ID_ATTR, None)
    if isinstance(cached, str) and cached:
        return cached

    headers = _headers_dict(request)
    incoming = str(headers.get("x-request-id", "")).strip()
    request_id = incoming or create_request_id()

    try:
        setattr(request, _REQUEST_ID_ATTR, request_id)
    except Exception:  # noqa: BLE001
        return request_id

    return request_id


def event_request_id(request: Any = None) -> str:
    """Return a request-linked id for events."""

    if request is not None:
        return resolve_request_id(request)
    return create_request_id()


async def emit_auth_event(
    config: AuthFnConfig | Dict[str, Any] | Any, event: AuthFnEvent | Dict[str, Any]
) -> None:
    """Emit a redacted authfn event through the configured sink."""

    observability = getattr(config, "observability", None)
    emit = getattr(observability, "emit", None)
    if emit is None and isinstance(observability, dict):
        emit = observability.get("emit")
    if emit is None:
        return

    payload = event if isinstance(event, AuthFnEvent) else AuthFnEvent.model_validate(event)
    sanitized = AuthFnEvent.model_validate(_sanitize_value(payload.model_dump(by_alias=True)))

    try:
        maybe = emit(sanitized)
        if hasattr(maybe, "__await__"):
            await maybe
    except Exception:  # noqa: BLE001
        return


def _sanitize_value(value: Any, key: str | None = None) -> Any:
    if key and any(part in key.lower() for part in _SENSITIVE_KEY_PARTS):
        return _REDACTED

    if isinstance(value, list):
        return [_sanitize_value(entry) for entry in value]

    if isinstance(value, dict):
        return {
            entry_key: _sanitize_value(entry_value, entry_key)
            for entry_key, entry_value in value.items()
        }

    return value


def _headers_dict(request: Any) -> Dict[str, Any]:
    headers = getattr(request, "headers", {}) or {}
    if hasattr(headers, "items"):
        return {str(key).lower(): value for key, value in headers.items()}
    return {str(key).lower(): value for key, value in dict(headers).items()}

