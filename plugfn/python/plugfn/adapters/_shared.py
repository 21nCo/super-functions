"""Shared adapter helpers for PlugFn web framework integrations."""

from inspect import isawaitable
from typing import Any, Optional


class AdapterSecurityError(Exception):
    """Deterministic adapter-layer security error."""

    def __init__(
        self, code: str, message: str, status_code: int, details: Optional[dict[str, Any]] = None
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or {}


async def resolve_principal(request_obj: Any, plug: Any, auth_override: Optional[Any]) -> dict[str, Any]:
    auth_provider = auth_override or getattr(getattr(plug, "config", None), "auth", None)
    if auth_provider is None:
        raise AdapterSecurityError("PLUGFN_AUTH_REQUIRED", "Authentication is required", 401)

    principal = await invoke_auth_provider(auth_provider, request_obj)
    normalized = normalize_principal(principal)
    if normalized is None:
        raise AdapterSecurityError("PLUGFN_AUTH_REQUIRED", "Authentication is required", 401)
    return normalized


async def invoke_auth_provider(auth_provider: Any, request_obj: Any) -> Any:
    for attribute in ("authenticate", "require_auth", "requireAuth", "get_user_id", "getUserId"):
        method = getattr(auth_provider, attribute, None)
        if callable(method):
            result = method(request_obj)
            return await result if isawaitable(result) else result

    if callable(auth_provider):
        result = auth_provider(request_obj)
        return await result if isawaitable(result) else result

    return None


def normalize_principal(principal: Any) -> Optional[dict[str, Any]]:
    if principal is None:
        return None

    if isinstance(principal, str):
        return {"user_id": principal}

    if isinstance(principal, dict):
        user_id = principal.get("user_id") or principal.get("userId")
        if isinstance(user_id, str) and user_id:
            return {
                "user_id": user_id,
                "tenant_id": principal.get("tenant_id") or principal.get("tenantId"),
            }

    return None


def assert_identity_match(principal: dict[str, Any], requested_user_id: Any) -> None:
    if requested_user_id is None:
        return

    if requested_user_id != principal["user_id"]:
        raise AdapterSecurityError(
            "TENANT_ACCESS_DENIED",
            "Caller identity does not match the authenticated principal",
            403,
            {"userId": principal["user_id"]},
        )


def normalize_scopes(value: Any) -> Optional[list[str]]:
    if value is None:
        return None
    if isinstance(value, list):
        scopes = [scope for scope in value if isinstance(scope, str) and scope]
        return scopes or None
    if isinstance(value, str):
        scopes = [scope.strip() for scope in value.split(",") if scope.strip()]
        return scopes or None
    return None


def resolve_webhook_secret(plug: Any, provider: str) -> Optional[str]:
    connection_manager = getattr(plug, "_connection_manager", None)
    if connection_manager and hasattr(connection_manager, "resolve_webhook_secret"):
        return connection_manager.resolve_webhook_secret(provider)

    integrations = getattr(getattr(plug, "config", None), "integrations", {}) or {}
    provider_config = integrations.get(provider, {})
    for key in ("webhook_secret", "signing_secret", "webhookSigningSecret", "signingSecret"):
        value = provider_config.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def normalize_headers(headers: dict[str, Any]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in headers.items():
        if isinstance(value, str):
            normalized[key.lower()] = value
    return normalized


def success_payload(data: dict[str, Any]) -> dict[str, Any]:
    return {"ok": True, "data": data}


def error_payload(error: Exception) -> tuple[dict[str, Any], int]:
    if isinstance(error, AdapterSecurityError):
        return (
            {
                "ok": False,
                "error": {
                    "code": error.code,
                    "message": str(error),
                    "status": error.status_code,
                    "details": error.details,
                },
            },
            error.status_code,
        )

    error_code = getattr(error, "code", "VALIDATION_ERROR")
    status_code = getattr(error, "status", 400)
    return (
        {
            "ok": False,
            "error": {
                "code": error_code,
                "message": str(error),
                "status": status_code,
                "details": {},
            },
        },
        status_code,
    )
