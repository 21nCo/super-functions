"""Placement-bound auth context for trusted AuthFn consumers."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import json
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple, TypeGuard, cast
from urllib.parse import urlparse

import idna

from ..http import _hash_secret, get_cookie_session_state
from ..observability import emit_auth_event, resolve_request_id
from ..plugins.gateway_routing import (
    IdentityPlacement,
    IdentityPlacementDirectory,
    RoutingKeyring,
    RoutingSigningKey,
)
from ..types import (
    ApiKeyRevokedError,
    AuthFnConfig,
    ConfigError,
    ExpiredCredentialsError,
    PlacementContextInvalidError,
    PlacementDirectoryUnavailableError,
    PlacementMovingError,
    RegionNotFoundError,
    SessionExpiredError,
    SessionRevokedError,
    UnauthorizedError,
    ValidationError,
)

CONTEXT_KIND = "placement-context"
INTERNAL_HEADER_PREFIX = "x-authfn-routing-"
DEFAULT_TTL_SECONDS = 60
MAX_TTL_SECONDS = 300
AUTH_REQUIRED = "Authentication required"
SESSION_EXPIRED = "Session expired"
SESSION_REVOKED = "Session revoked"


@dataclass(frozen=True)
class PlacementBoundAuthContext:
    subject: str
    home_region: str
    placement_epoch: int
    issuer: str
    session_binding: str
    session_version: str
    authenticated_at: str
    issued_at: str
    expires_at: str
    audience: str
    assurance: Tuple[str, ...]
    request_id: str
    actor_type: str
    scopes: Optional[Tuple[str, ...]] = None
    user_id: Optional[str] = None


class PlacementContextIssuer:
    """Opt-in in-process and private-service placement context issuer."""

    def __init__(
        self,
        *,
        config: AuthFnConfig,
        subject_secret: bytes | str,
        audiences: Sequence[str],
        public_authority: str,
        placement_directory: IdentityPlacementDirectory,
        identity_key_for_user_id: Callable[[str], str | Awaitable[str]],
        audience: Optional[str] = None,
        keyring: Optional[RoutingKeyring] = None,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        clock_skew_seconds: int = 5,
        include_user_id: bool = False,
        clock: Callable[[], float] = time.time,
        on_event: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> None:
        mac_key = _secret_bytes(subject_secret)
        if len(mac_key) < 32:
            raise ConfigError("Placement-context subject_secret must be at least 32 bytes")
        allowed = tuple(dict.fromkeys(item.strip() for item in audiences if item.strip()))
        if not allowed:
            raise ConfigError("Placement-bound auth context requires at least one audience")
        default_audience = allowed[0] if audience is None else audience
        if default_audience not in allowed:
            raise ConfigError("Default placement-context audience must be in the allowlist")
        ttl_seconds = _require_int("ttl_seconds", ttl_seconds, 1, MAX_TTL_SECONDS)
        clock_skew_seconds = _require_int("clock_skew_seconds", clock_skew_seconds, 0, 60)
        if keyring is not None:
            _validate_keyring(keyring)
        self._config = config
        self._mac_key = mac_key
        self._audiences = allowed
        self._default_audience = default_audience
        self._public_authority = _normalize_authority(public_authority)
        self._directory = placement_directory
        self._identity_key_for_user_id = identity_key_for_user_id
        self._keyring = keyring
        self._ttl_seconds = ttl_seconds
        self._clock_skew_seconds = clock_skew_seconds
        self._include_user_id = include_user_id
        self._clock = clock
        self._on_event = on_event
        self._verifier = (
            PlacementContextVerifier(
                audiences=allowed,
                public_authority=self._public_authority,
                keyring=keyring,
                audience=default_audience,
                clock_skew_seconds=clock_skew_seconds,
                clock=clock,
                config=config,
                on_event=on_event,
            )
            if keyring is not None
            else None
        )

    async def derive(self, request: Any, *, audience: Optional[str] = None) -> PlacementBoundAuthContext:
        request_id = resolve_request_id(request)
        sanitized = _strip_routing_headers(request)
        if not any(key.lower() == "x-request-id" for key in sanitized.headers):
            sanitized.headers["x-request-id"] = request_id
        try:
            resolved_audience = _require_audience(
                self._default_audience if audience is None else audience,
                self._audiences,
            )
            principal = await _resolve_principal(self._config, sanitized, self._clock)
            identity_key = self._identity_key_for_user_id(principal["user_id"])
            if inspect.isawaitable(identity_key):
                identity_key = await identity_key
            placement = await _load_active_placement(self._directory, str(identity_key))
            issued_at = int(self._clock())
            expires_at = issued_at + self._ttl_seconds
            session_expiry = principal.get("session_expires_at")
            if isinstance(session_expiry, datetime):
                expires_at = min(expires_at, int(session_expiry.timestamp()))
            if expires_at <= issued_at:
                raise SessionExpiredError(SESSION_EXPIRED)
            authenticated_at = principal["authenticated_at"]
            context = PlacementBoundAuthContext(
                subject=_hmac_opaque(self._mac_key, "subject", principal["user_id"]),
                home_region=placement.region_id,
                placement_epoch=placement.epoch,
                issuer=self._public_authority,
                session_binding=_hmac_opaque(self._mac_key, "session", principal["session_id"]),
                session_version=_hmac_opaque(
                    self._mac_key,
                    "session-version",
                    principal["session_version_material"],
                ),
                authenticated_at=_isoformat(authenticated_at),
                issued_at=_isoformat(datetime.fromtimestamp(issued_at, tz=timezone.utc)),
                expires_at=_isoformat(datetime.fromtimestamp(expires_at, tz=timezone.utc)),
                audience=resolved_audience,
                assurance=tuple(principal["methods"]),
                scopes=tuple(principal["scopes"]) if principal.get("scopes") else None,
                request_id=request_id,
                actor_type=principal["actor_type"],
                user_id=principal["user_id"] if self._include_user_id else None,
            )
            await self._emit(
                {
                    "type": "authfn.placement_context.issued",
                    "requestId": request_id,
                    "regionId": context.home_region,
                    "outcome": "success",
                    "metadata": {
                        "epoch": context.placement_epoch,
                        "audience": context.audience,
                        "actorType": context.actor_type,
                        "subjectDigest": _telemetry_hash(context.subject),
                    },
                }
            )
            return context
        except Exception as error:
            await self._emit(
                {
                    "type": "authfn.placement_context.rejected",
                    "requestId": request_id,
                    "outcome": "rejected",
                    "metadata": {"errorType": getattr(error, "code", "AUTHFN_INTERNAL_ERROR")},
                }
            )
            raise

    async def with_context(
        self,
        request: Any,
        consumer: Callable[[PlacementBoundAuthContext], Any],
        *,
        audience: Optional[str] = None,
    ) -> Any:
        context = await self.derive(request, audience=audience)
        result = consumer(context)
        if isinstance(result, Awaitable):
            return await result
        return result

    async def issue_signed(
        self,
        request: Any,
        *,
        audience: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self._keyring is None:
            raise ConfigError("Signed placement context requires a keyring")
        context = await self.derive(request, audience=audience)
        payload = _payload_from_context(context, self._keyring)
        return {"context": context, "assertion": _sign(payload, self._keyring)}

    def verify_signed(self, assertion: str, *, audience: Optional[str] = None) -> PlacementBoundAuthContext:
        if self._verifier is None:
            raise ConfigError("Placement-context verification requires a keyring")
        return self._verifier.verify_signed(assertion, audience=audience)

    async def _emit(self, event: Dict[str, Any]) -> None:
        self._notify(event)
        await emit_auth_event(self._config, event)

    def _emit_sync(self, event: Dict[str, Any]) -> None:
        self._notify(event)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(emit_auth_event(self._config, event))
            return
        loop.create_task(emit_auth_event(self._config, event))

    def _notify(self, event: Dict[str, Any]) -> None:
        if self._on_event is None:
            return
        try:
            self._on_event(event)
        except Exception:  # noqa: BLE001
            return


def create_placement_context_issuer(**kwargs: Any) -> PlacementContextIssuer:
    return PlacementContextIssuer(**kwargs)


class PlacementContextVerifier:
    """Verification-only consumer. HMAC holders are trusted co-issuers."""

    def __init__(
        self,
        *,
        audiences: Sequence[str],
        public_authority: str,
        keyring: RoutingKeyring,
        audience: Optional[str] = None,
        clock_skew_seconds: int = 5,
        clock: Callable[[], float] = time.time,
        config: Optional[AuthFnConfig] = None,
        on_event: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> None:
        allowed = tuple(dict.fromkeys(item.strip() for item in audiences if item.strip()))
        if not allowed:
            raise ConfigError("Placement-bound auth context requires at least one audience")
        default_audience = allowed[0] if audience is None else audience
        if default_audience not in allowed:
            raise ConfigError("Default placement-context audience must be in the allowlist")
        self._audiences = allowed
        self._default_audience = default_audience
        self._public_authority = _normalize_authority(public_authority)
        self._keyring = keyring
        _validate_keyring(keyring)
        self._clock_skew_seconds = _require_int("clock_skew_seconds", clock_skew_seconds, 0, 60)
        self._clock = clock
        self._config = config
        self._on_event = on_event

    def verify_signed(self, assertion: str, *, audience: Optional[str] = None) -> PlacementBoundAuthContext:
        requested_audience = self._default_audience if audience is None else audience
        verified_request_id: Optional[str] = None
        try:
            payload = _verify(assertion, self._keyring, self._clock, self._clock_skew_seconds)
            request_id = payload.get("requestId")
            if isinstance(request_id, str):
                verified_request_id = request_id
            resolved_audience = _require_audience(requested_audience, self._audiences)
            if payload.get("audience") != resolved_audience:
                raise PlacementContextInvalidError("Placement-bound auth context audience is invalid")
            if payload.get("issuer") != self._public_authority:
                raise PlacementContextInvalidError("Placement-bound auth context issuer is invalid")
            context = _context_from_payload(payload)
            self._emit_sync(
                {
                    "type": "authfn.placement_context.verified",
                    "requestId": context.request_id,
                    "regionId": context.home_region,
                    "outcome": "success",
                    "metadata": {
                        "epoch": context.placement_epoch,
                        "audience": context.audience,
                        "subjectDigest": _telemetry_hash(context.subject),
                    },
                }
            )
            return context
        except Exception as error:
            self._emit_sync(
                {
                    "type": "authfn.placement_context.verification_failed",
                    "requestId": verified_request_id or _request_id(None),
                    "outcome": "rejected",
                    "metadata": {
                        "errorType": getattr(error, "code", "AUTHFN_PLACEMENT_CONTEXT_INVALID"),
                        "audience": requested_audience,
                    },
                }
            )
            if isinstance(error, PlacementContextInvalidError):
                raise
            raise PlacementContextInvalidError() from error

    def _emit_sync(self, event: Dict[str, Any]) -> None:
        if self._on_event is not None:
            try:
                self._on_event(event)
            except Exception:  # noqa: BLE001
                pass
        if self._config is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(emit_auth_event(self._config, event))
            return
        loop.create_task(emit_auth_event(self._config, event))


def create_placement_context_verifier(**kwargs: Any) -> PlacementContextVerifier:
    return PlacementContextVerifier(**kwargs)


async def _resolve_principal(
    config: AuthFnConfig,
    request: Any,
    clock: Callable[[], float],
) -> Dict[str, Any]:
    state = await get_cookie_session_state(config, request, touch=False)
    cookie_principal = await _cookie_principal_for_clock(config, state, clock)
    if cookie_principal is not None:
        return cookie_principal
    secret = _authorization_secret(request)
    if secret:
        bearer_session = await _resolve_bearer_session(config, secret, clock)
        if bearer_session is not None:
            return bearer_session
        return await _resolve_api_key_principal(config, secret, clock)
    if state.session_token:
        return _fail_closed_cookie_state(state, clock)
    raise UnauthorizedError(AUTH_REQUIRED)


async def _cookie_principal_for_clock(
    config: AuthFnConfig,
    state: Any,
    clock: Callable[[], float],
) -> Optional[Dict[str, Any]]:
    record = state.session_record
    if record is None or record.get("revokedAt") is not None:
        return None
    if _credential_expired(record.get("expiresAt"), clock):
        return None
    if state.session is not None and state.user is not None:
        return _principal_from_cookie_state(state)
    user = state.user
    if user is None:
        user = await config.database.find_one(
            model="users",
            where=[{"field": "id", "operator": "eq", "value": record["userId"]}],
            namespace=config.namespace,
        )
    if user is None:
        return None
    return {
        "user_id": user["id"],
        "actor_type": "user",
        "session_id": record["id"],
        "session_version_material": _credential_version_material(record),
        "methods": list(record.get("methods") or ["password"]),
        "authenticated_at": record.get("lastAuthenticatedAt") or record.get("createdAt"),
        "session_expires_at": record.get("expiresAt"),
    }


def _fail_closed_cookie_state(state: Any, clock: Callable[[], float]) -> Dict[str, Any]:
    if state.failure_reason == "revoked" or (state.session_record and state.session_record.get("revokedAt")):
        raise SessionRevokedError(SESSION_REVOKED)
    if _credential_expired((state.session_record or {}).get("expiresAt"), clock) or state.failure_reason == "expired":
        raise SessionExpiredError(SESSION_EXPIRED)
    return _principal_from_cookie_state(state)


def _credential_expired(expires_at: Any, clock: Callable[[], float]) -> bool:
    if isinstance(expires_at, datetime):
        return expires_at.timestamp() <= clock()
    return False


def _principal_from_cookie_state(state: Any) -> Dict[str, Any]:
    if state.failure_reason == "revoked":
        raise SessionRevokedError(SESSION_REVOKED)
    if state.failure_reason == "expired":
        raise SessionExpiredError(SESSION_EXPIRED)
    if state.session is None or state.session_record is None or state.user is None:
        raise UnauthorizedError(AUTH_REQUIRED)
    record = state.session_record
    user = state.user
    return {
        "user_id": user["id"],
        "actor_type": "user",
        "session_id": record["id"],
        "session_version_material": _credential_version_material(record),
        "methods": list(state.session.methods),
        "authenticated_at": record.get("lastAuthenticatedAt") or record.get("createdAt"),
        "session_expires_at": record.get("expiresAt"),
    }


async def _resolve_api_key_principal(
    config: AuthFnConfig,
    secret: str,
    clock: Callable[[], float],
) -> Dict[str, Any]:
    # Same keyed lookup AuthFn uses for API keys (not password storage).
    secret_hash = _hash_secret(secret)  # codeql[py/weak-sensitive-data-hashing]
    row = await config.database.find_one(
        model="api_keys",
        where=[{"field": "secretHash", "operator": "eq", "value": secret_hash}],
        namespace=config.namespace,
    )
    if row is None:
        raise UnauthorizedError(AUTH_REQUIRED)
    if row.get("revokedAt") is not None:
        raise ApiKeyRevokedError("API key has been revoked")
    expires_at = row.get("expiresAt")
    if isinstance(expires_at, datetime) and expires_at.timestamp() <= clock():
        raise ExpiredCredentialsError("API key has expired")
    user_id = row.get("userId")
    if not user_id:
        raise UnauthorizedError(AUTH_REQUIRED)
    user = await config.database.find_one(
        model="users",
        where=[{"field": "id", "operator": "eq", "value": user_id}],
        namespace=config.namespace,
    )
    if user is None:
        raise UnauthorizedError(AUTH_REQUIRED)
    scopes = row.get("scopes") or []
    return {
        "user_id": user["id"],
        "actor_type": "api-key",
        "session_id": row["id"],
        "session_version_material": _credential_version_material(row),
        "methods": ["api-key"],
        "scopes": [scope for scope in scopes if isinstance(scope, str)],
        "authenticated_at": row.get("lastUsedAt") or row.get("createdAt"),
        "session_expires_at": row.get("expiresAt"),
    }


async def _resolve_bearer_session(
    config: AuthFnConfig,
    session_token: str,
    clock: Callable[[], float],
) -> Optional[Dict[str, Any]]:
    record = await config.database.find_one(
        model="sessions",
        where=[{
            "field": "tokenHash",
            "operator": "eq",
            "value": _hash_secret(session_token),  # codeql[py/weak-sensitive-data-hashing]
        }],
        namespace=config.namespace,
    )
    if record is None:
        return None
    if record.get("revokedAt") is not None:
        raise SessionRevokedError(SESSION_REVOKED)
    expires_at = record.get("expiresAt")
    if isinstance(expires_at, datetime) and expires_at.timestamp() <= clock():
        raise SessionExpiredError(SESSION_EXPIRED)
    user = await config.database.find_one(
        model="sessions",
        where=[{"field": "id", "operator": "eq", "value": record["userId"]}],
        namespace=config.namespace,
    )
    if user is None:
        raise UnauthorizedError(AUTH_REQUIRED)
    methods = record.get("methods") or []
    return {
        "user_id": user["id"],
        "actor_type": "user",
        "session_id": record["id"],
        "session_version_material": _credential_version_material(record),
        "methods": [str(item) for item in methods] if isinstance(methods, list) else ["password"],
        "authenticated_at": record.get("lastAuthenticatedAt") or record.get("createdAt"),
        "session_expires_at": record.get("expiresAt"),
    }
