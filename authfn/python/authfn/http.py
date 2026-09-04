"""Shared HTTP route construction and envelope helpers for authfn Python."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, cast
from urllib.parse import parse_qs, urlparse

from superfunctions.http import HttpMethod, Response, Route, RouteContext, SetCookie

from .config import get_plugin_config, resolve_runtime
from .errors import to_authfn_error
from .observability import (
    emit_auth_event,
    event_request_id,
)
from .observability import (
    resolve_request_id as resolve_observability_request_id,
)
from .plugins.api_keys import ApiKeyPluginConfig, ApiKeyService
from .plugins.email_otp import EmailOtpPluginConfig, EmailOtpService
from .plugins.gateway_routing import create_cell_routing_middleware
from .plugins.multi_region import MultiRegionPluginConfig, MultiRegionService
from .plugins.two_factor import TwoFactorPluginConfig, TwoFactorService
from .types import (
    AuthFnConfig,
    AuthFnError,
    AuthFnHookContext,
    AuthFnSession,
    ConflictError,
    CsrfInvalidError,
    InternalError,
    InvalidCredentialsError,
    NotFoundError,
    PluginAbortedError,
    SessionExpiredError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
DEFAULT_CSRF_MAX_AGE_SECONDS = DEFAULT_SESSION_MAX_AGE_SECONDS
PASSWORD_HASH_ALGO = "scrypt"
PASSWORD_HASH_N = 16384
PASSWORD_HASH_R = 8
PASSWORD_HASH_P = 1
PASSWORD_HASH_KEY_LENGTH = 64
MIN_PASSWORD_LENGTH = 12


@dataclass
class CookiePolicy:
    prefix: str
    path: str
    domain: Optional[str]
    secure: bool
    same_site: str
    session_max_age_seconds: int
    csrf_max_age_seconds: int
    session_cookie_name: str
    csrf_cookie_name: str


@dataclass
class SessionState:
    runtime: Any
    cookie_policy: CookiePolicy
    session_token: Optional[str] = None
    csrf_token: Optional[str] = None
    session: Optional[AuthFnSession] = None
    session_record: Optional[Dict[str, Any]] = None
    user: Optional[Dict[str, Any]] = None
    failure_reason: Optional[str] = None


def resolve_request_id(request: Any) -> str:
    return resolve_observability_request_id(request)


def success_envelope(request_id: str, data: Any) -> Dict[str, Any]:
    return {"ok": True, "data": _normalize_json_value(data), "requestId": request_id}


def error_envelope(request_id: str, error: Any) -> Dict[str, Any]:
    auth_error = to_authfn_error(error)
    return {
        "ok": False,
        "error": {
            "code": auth_error.code,
            "message": str(auth_error),
            "retryable": auth_error.retryable,
            "details": _normalize_json_value(auth_error.details),
        },
        "requestId": request_id,
    }


def json_success(
    request: Any,
    data: Any,
    *,
    status: int = 200,
    cookies: Optional[List[SetCookie]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    request_id = resolve_request_id(request)
    response_headers = {"content-type": "application/json", "x-request-id": request_id}
    if headers:
        response_headers.update(headers)
    return Response(
        status=status,
        headers=response_headers,
        cookies=cookies or [],
        body=success_envelope(request_id, data),
    )


def json_error(request: Any, error: Any) -> Response:
    request_id = resolve_request_id(request)
    auth_error = to_authfn_error(error)
    return Response(
        status=auth_error.status,
        headers={"content-type": "application/json", "x-request-id": request_id},
        body=error_envelope(request_id, auth_error),
    )


def create_authfn_route_meta(
    operation_id: str,
    summary: str,
    auth: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "auth": auth,
        "openapi": {
            "operationId": operation_id,
            "summary": summary,
            "tags": ["authfn"],
        },
    }


def create_authfn_routes(config: AuthFnConfig) -> List[Route]:
    routes: List[Route] = [*_create_base_routes(config)]
    for plugin in config.plugins:
        if plugin.name == "password":
            routes.extend(_create_password_routes(config))
        elif plugin.name == "emailOtp":
            routes.extend(_create_otp_routes(config))
        elif plugin.name == "socialOAuth":
            routes.extend(_create_social_routes(config))
        elif plugin.name == "apiKey":
            routes.extend(_create_api_key_routes(config))
        elif plugin.name == "twoFactor":
            routes.extend(_create_two_factor_routes(config))
        elif plugin.name == "multiRegion":
            routes.extend(_create_multi_region_routes(config))
    base_path = (config.base_path or "/auth").rstrip("/")
    resolved_routes = [
        route.model_copy(update={"path": _join_path(base_path, route.path)})
        for route in routes
    ]
    plugin_config = get_plugin_config(config, "multiRegion", MultiRegionPluginConfig())
    routing = plugin_config.routing
    if routing and routing.mode == "gateway":
        placement_middleware = create_cell_routing_middleware(routing, base_path=base_path)
        resolved_routes = [
            route.model_copy(
                update={"middleware": [placement_middleware, *(route.middleware or [])]}
            )
            for route in resolved_routes
        ]
    return resolved_routes


async def authenticate_request(config: AuthFnConfig, request: Any) -> Optional[AuthFnSession]:
    request = _with_url(request, _best_effort_url(request))
    state = await get_cookie_session_state(config, request)
    if state.session is not None:
        return state.session

    api_key_config = get_plugin_config(config, "apiKey", ApiKeyPluginConfig())
    return await ApiKeyService(config, api_key_config).authenticate(request)


async def get_cookie_session_state(
    config: AuthFnConfig,
    request: Any,
    *,
    touch: bool = True,
) -> SessionState:
    runtime = resolve_runtime(config, request)
    cookie_policy = resolve_cookie_policy(config, request, runtime)
    cookies = _parse_cookies(_headers_dict(request).get("cookie", ""))
    session_token = cookies.get(cookie_policy.session_cookie_name)
    csrf_token = cookies.get(cookie_policy.csrf_cookie_name)
    state = SessionState(
        runtime=runtime,
        cookie_policy=cookie_policy,
        session_token=session_token,
        csrf_token=csrf_token,
    )
    if not session_token:
        state.failure_reason = "missing"
        return state

    record = await config.database.find_one(
        model="sessions",
        where=[{"field": "tokenHash", "operator": "eq", "value": _hash_secret(session_token)}],
        namespace=config.namespace,
    )
    if record is None:
        state.failure_reason = "missing"
        return state
    if record.get("revokedAt") is not None:
        state.session_record = record
        state.failure_reason = "revoked"
        return state
    expires_at = record.get("expiresAt")
    if expires_at is not None and _coerce_utc(expires_at) <= _utcnow():
        state.session_record = record
        state.failure_reason = "expired"
        return state

    user = await config.database.find_one(
        model="users",
        where=[{"field": "id", "operator": "eq", "value": record["userId"]}],
        namespace=config.namespace,
    )
    if user is None:
        state.failure_reason = "missing"
        return state

    if not touch:
        state.session_record = record
        state.user = user
        state.session = _build_user_session(record, user, runtime.region_id)
        return state

    now = _utcnow()
    updated = await config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": record["id"]}],
        data={"lastAuthenticatedAt": now, "updatedAt": now},
        namespace=config.namespace,
    )
    record = updated or {**record, "lastAuthenticatedAt": now, "updatedAt": now}
    state.session_record = record
    state.user = user
    state.session = _build_user_session(record, user, runtime.region_id)
    return state


async def require_cookie_session(config: AuthFnConfig, request: Any) -> SessionState:
    state = await get_cookie_session_state(config, request)
    if state.failure_reason == "revoked":
        raise SessionRevokedError("Session revoked")
    if state.failure_reason == "expired":
        raise SessionExpiredError("Session expired")
    if state.session is None or state.session_record is None or state.user is None:
        raise UnauthorizedError("Authentication required")
    return state


def resolve_cookie_policy(config: AuthFnConfig, request: Any, runtime: Any) -> CookiePolicy:
    cookie_payload = {}
    if config.cookie is not None:
        cookie_payload.update(config.cookie.model_dump(by_alias=True, exclude_none=True))
    runtime_cookie = getattr(runtime, "cookie", None)
    if runtime_cookie is not None:
        if hasattr(runtime_cookie, "model_dump"):
            cookie_payload.update(runtime_cookie.model_dump(by_alias=True, exclude_none=True))
        elif isinstance(runtime_cookie, dict):
            cookie_payload.update({k: v for k, v in runtime_cookie.items() if v is not None})

    prefix = str(cookie_payload.get("prefix") or "authfn").strip() or "authfn"
    path = cookie_payload.get("path") or "/"
    domain = cookie_payload.get("domain")
    secure = bool(cookie_payload.get("secure", True))
    same_site = str(cookie_payload.get("sameSite") or "lax").lower()
    session_max_age_seconds = int(
        cookie_payload.get("sessionMaxAgeSeconds") or DEFAULT_SESSION_MAX_AGE_SECONDS
    )
    csrf_max_age_seconds = int(
        cookie_payload.get("csrfMaxAgeSeconds") or DEFAULT_CSRF_MAX_AGE_SECONDS
    )

    return CookiePolicy(
        prefix=prefix,
        path=path,
        domain=domain,
        secure=secure,
        same_site=same_site,
        session_max_age_seconds=session_max_age_seconds,
        csrf_max_age_seconds=csrf_max_age_seconds,
        session_cookie_name=f"__Secure-{prefix}.session" if secure else f"{prefix}.session",
        csrf_cookie_name=f"{prefix}.csrf",
    )


def issue_session_cookies(
    cookie_policy: CookiePolicy,
    session_token: str,
    csrf_token: str,
) -> List[SetCookie]:
    return [
        SetCookie(
            name=cookie_policy.session_cookie_name,
            value=session_token,
            path=cookie_policy.path,
            domain=cookie_policy.domain,
            secure=cookie_policy.secure,
            httpOnly=True,
            sameSite=cookie_policy.same_site,
            maxAge=cookie_policy.session_max_age_seconds,
        ),
        SetCookie(
            name=cookie_policy.csrf_cookie_name,
            value=csrf_token,
            path=cookie_policy.path,
            domain=cookie_policy.domain,
            secure=cookie_policy.secure,
            httpOnly=False,
            sameSite=cookie_policy.same_site,
            maxAge=cookie_policy.csrf_max_age_seconds,
        ),
    ]


def clear_session_cookies(cookie_policy: CookiePolicy) -> List[SetCookie]:
    expires = datetime.fromtimestamp(0, tz=timezone.utc)
    return [
        SetCookie(
            name=cookie_policy.session_cookie_name,
            value="",
            path=cookie_policy.path,
            domain=cookie_policy.domain,
            secure=cookie_policy.secure,
            httpOnly=True,
            sameSite=cookie_policy.same_site,
            maxAge=0,
            expires=expires,
        ),
        SetCookie(
            name=cookie_policy.csrf_cookie_name,
            value="",
            path=cookie_policy.path,
            domain=cookie_policy.domain,
            secure=cookie_policy.secure,
            httpOnly=False,
            sameSite=cookie_policy.same_site,
            maxAge=0,
            expires=expires,
        ),
    ]


async def issue_session(
    config: AuthFnConfig,
    request: Any,
    *,
    user: Dict[str, Any],
    methods: List[str],
) -> Dict[str, Any]:
    runtime = resolve_runtime(config, request)
    cookie_policy = resolve_cookie_policy(config, request, runtime)
    now = _utcnow()
    payload = {
        "userId": user["id"],
        "primaryEmail": user.get("primaryEmail"),
        "tenantId": None,
        "regionId": getattr(runtime, "region_id", None) or getattr(runtime, "regionId", None),
        "methods": list(methods),
        "metadata": {},
    }
    payload = await _run_before_session_issue_hook(config, request, runtime, payload)
    session_token = _create_opaque_token("st")
    csrf_token = _create_opaque_token("csrf")
    record = {
        "id": _create_opaque_token("sess"),
        "userId": payload["userId"],
        "tokenHash": _hash_secret(session_token),
        "csrfHash": _hash_secret(csrf_token),
        "methods": list(payload["methods"]),
        "metadata": payload.get("metadata") or {},
        "expiresAt": now + timedelta(seconds=cookie_policy.session_max_age_seconds),
        "revokedAt": None,
        "createdAt": now,
        "updatedAt": now,
        "lastAuthenticatedAt": now,
    }
    await config.database.create(model="sessions", data=record, namespace=config.namespace)
    session = _build_user_session(record, user, payload.get("regionId"))
    await _run_after_session_issue_hook(config, request, runtime, session)
    await emit_auth_event(
        config,
        {
            "type": "authfn.session.issued",
            "requestId": event_request_id(request),
            "actorId": session.actor_id,
            "sessionId": session.id,
            "userId": session.actor_id,
            "regionId": session.region_id,
            "outcome": "issued",
            "metadata": {"methods": session.methods},
        },
    )
    return {
        "session": session,
        "record": record,
        "sessionToken": session_token,
        "csrfToken": csrf_token,
        "cookies": issue_session_cookies(cookie_policy, session_token, csrf_token),
        "cookiePolicy": cookie_policy,
    }


async def revoke_session_by_id(
    config: AuthFnConfig,
    session_id: str,
    *,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    record = await config.database.find_one(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": session_id}],
        namespace=config.namespace,
    )
    if record is None or (user_id is not None and record.get("userId") != user_id):
        raise NotFoundError("Session not found", {"sessionId": session_id})
    if record.get("revokedAt") is not None:
        return record
    revoked_at = _utcnow()
    await config.database.update(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": record["id"]}],
        data={"revokedAt": revoked_at, "updatedAt": revoked_at},
        namespace=config.namespace,
    )
    return {**record, "revokedAt": revoked_at, "updatedAt": revoked_at}
