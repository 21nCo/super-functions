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
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from ..http import _hash_secret, get_cookie_session_state
from ..observability import emit_auth_event
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
        identity_key_for_user_id: Callable[[str], str],
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
        default_audience = audience or allowed[0]
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
        sanitized = _strip_routing_headers(request)
        request_id = _request_id(sanitized)
        try:
            resolved_audience = _require_audience(audience or self._default_audience, self._audiences)
            principal = await _resolve_principal(self._config, sanitized)
            identity_key = self._identity_key_for_user_id(principal["user_id"])
            placement = await _load_active_placement(self._directory, identity_key)
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
        default_audience = audience or allowed[0]
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
        requested_audience = audience or self._default_audience
        try:
            resolved_audience = _require_audience(requested_audience, self._audiences)
            payload = _verify(assertion, self._keyring, self._clock, self._clock_skew_seconds)
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
                    "requestId": _request_id(None),
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


async def _resolve_principal(config: AuthFnConfig, request: Any) -> Dict[str, Any]:
    state = await get_cookie_session_state(config, request, touch=False)
    if state.session is not None:
        return _principal_from_cookie_state(state)
    secret = _authorization_secret(request)
    if secret:
        bearer_session = await _resolve_bearer_session(config, secret)
        if bearer_session is not None:
            return bearer_session
        return await _resolve_api_key_principal(config, secret)
    if state.session_token:
        return _principal_from_cookie_state(state)
    raise UnauthorizedError(AUTH_REQUIRED)


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


async def _resolve_api_key_principal(config: AuthFnConfig, secret: str) -> Dict[str, Any]:
    row = await config.database.find_one(
        model="api_keys",
        where=[{"field": "secretHash", "operator": "eq", "value": _hash_secret(secret)}],
        namespace=config.namespace,
    )
    if row is None:
        raise UnauthorizedError(AUTH_REQUIRED)
    if row.get("revokedAt") is not None:
        raise ApiKeyRevokedError("API key has been revoked")
    expires_at = row.get("expiresAt")
    if isinstance(expires_at, datetime) and expires_at.timestamp() <= time.time():
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


async def _resolve_bearer_session(config: AuthFnConfig, session_token: str) -> Optional[Dict[str, Any]]:
    record = await config.database.find_one(
        model="sessions",
        where=[{
            "field": "tokenHash",
            "operator": "eq",
            "value": _hash_secret(session_token),
        }],
        namespace=config.namespace,
    )
    if record is None:
        return None
    if record.get("revokedAt") is not None:
        raise SessionRevokedError(SESSION_REVOKED)
    expires_at = record.get("expiresAt")
    if isinstance(expires_at, datetime) and expires_at.timestamp() <= time.time():
        raise SessionExpiredError(SESSION_EXPIRED)
    user = await config.database.find_one(
        model="users",
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


async def _load_active_placement(
    directory: IdentityPlacementDirectory,
    identity_key: str,
) -> IdentityPlacement:
    try:
        placement = await directory.get(identity_key)
    except Exception as error:  # noqa: BLE001
        raise PlacementDirectoryUnavailableError() from error
    if placement is None or placement.state == "tombstoned":
        raise RegionNotFoundError("Identity placement is not active")
    if placement.state in {"moving", "deleting"}:
        raise PlacementMovingError("Identity placement is moving", {"executionStarted": False})
    if placement.state != "active":
        raise RegionNotFoundError("Identity placement is not active")
    return placement


def _payload_from_context(context: PlacementBoundAuthContext, keyring: RoutingKeyring) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "kind": CONTEXT_KIND,
        "keyId": keyring.active.key_id,
        "subject": context.subject,
        "homeRegion": context.home_region,
        "placementEpoch": context.placement_epoch,
        "issuer": context.issuer,
        "sessionBinding": context.session_binding,
        "sessionVersion": context.session_version,
        "authenticatedAt": _unix(context.authenticated_at),
        "issuedAt": _unix(context.issued_at),
        "expiresAt": _unix(context.expires_at),
        "audience": context.audience,
        "assurance": list(context.assurance),
        "requestId": context.request_id,
        "actorType": context.actor_type,
        "nonce": secrets.token_urlsafe(16),
    }
    if context.scopes is not None:
        payload["scopes"] = list(context.scopes)
    if context.user_id:
        payload["userId"] = context.user_id
    return payload


def _context_from_payload(payload: Dict[str, Any]) -> PlacementBoundAuthContext:
    scopes = payload.get("scopes")
    return PlacementBoundAuthContext(
        subject=str(payload["subject"]),
        home_region=str(payload["homeRegion"]),
        placement_epoch=int(payload["placementEpoch"]),
        issuer=str(payload["issuer"]),
        session_binding=str(payload["sessionBinding"]),
        session_version=str(payload["sessionVersion"]),
        authenticated_at=_isoformat(datetime.fromtimestamp(int(payload["authenticatedAt"]), tz=timezone.utc)),
        issued_at=_isoformat(datetime.fromtimestamp(int(payload["issuedAt"]), tz=timezone.utc)),
        expires_at=_isoformat(datetime.fromtimestamp(int(payload["expiresAt"]), tz=timezone.utc)),
        audience=str(payload["audience"]),
        assurance=tuple(str(item) for item in payload.get("assurance") or ()),
        scopes=tuple(str(item) for item in scopes) if isinstance(scopes, list) else None,
        request_id=str(payload["requestId"]),
        actor_type=str(payload["actorType"]),
        user_id=str(payload["userId"]) if payload.get("userId") else None,
    )


def _sign(payload: Dict[str, Any], keyring: RoutingKeyring) -> str:
    encoded = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(_secret_bytes(keyring.active.secret), encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def _verify(
    token: str,
    keyring: RoutingKeyring,
    clock: Callable[[], float],
    clock_skew_seconds: int,
) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 2:
        raise PlacementContextInvalidError()
    encoded, signature = parts
    try:
        payload = json.loads(_unb64(encoded).decode("utf-8"))
    except Exception as error:  # noqa: BLE001
        raise PlacementContextInvalidError() from error
    if not _is_signed_payload(payload):
        raise PlacementContextInvalidError()
    key = next(
        (entry for entry in [keyring.active, *keyring.previous] if entry.key_id == payload.get("keyId")),
        None,
    )
    if key is None:
        raise PlacementContextInvalidError("Placement-bound auth context key is unknown")
    expected = hmac.new(_secret_bytes(key.secret), encoded.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(_unb64(signature), expected):
        raise PlacementContextInvalidError()
    now = int(clock())
    if int(payload["issuedAt"]) > now + clock_skew_seconds or int(payload["expiresAt"]) < now - clock_skew_seconds:
        raise PlacementContextInvalidError("Placement-bound auth context is expired")
    return payload


def _is_signed_payload(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    required = (
        value.get("kind") == CONTEXT_KIND
        and isinstance(value.get("keyId"), str)
        and isinstance(value.get("subject"), str)
        and isinstance(value.get("homeRegion"), str)
        and isinstance(value.get("placementEpoch"), int)
        and int(value["placementEpoch"]) >= 1
        and isinstance(value.get("issuer"), str)
        and isinstance(value.get("sessionBinding"), str)
        and isinstance(value.get("sessionVersion"), str)
        and isinstance(value.get("authenticatedAt"), int)
        and isinstance(value.get("issuedAt"), int)
        and isinstance(value.get("expiresAt"), int)
        and int(value["expiresAt"]) >= int(value["issuedAt"])
        and int(value["expiresAt"]) - int(value["issuedAt"]) <= MAX_TTL_SECONDS
        and isinstance(value.get("audience"), str)
        and isinstance(value.get("assurance"), list)
        and isinstance(value.get("requestId"), str)
        and value.get("actorType") in {"user", "api-key"}
        and isinstance(value.get("nonce"), str)
        and len(str(value.get("nonce"))) >= 16
    )
    return bool(required)


def _strip_routing_headers(request: Any) -> Any:
    headers = {
        key: value
        for key, value in getattr(request, "headers", {}).items()
        if not key.lower().startswith(INTERNAL_HEADER_PREFIX)
    }
    clone = type("SanitizedRequest", (), {})()
    clone.method = getattr(request, "method", "GET")
    clone.url = getattr(request, "url", "")
    clone.headers = headers
    clone._body = getattr(request, "_body", None)
    original_json = getattr(request, "json", None)
    original_body = getattr(request, "body", None)

    async def read_json() -> Any:
        if callable(original_json):
            result = original_json()
            if inspect.isawaitable(result):
                return await result
            return result
        return getattr(request, "_body", None)

    async def read_body() -> bytes:
        if callable(original_body):
            result = original_body()
            if inspect.isawaitable(result):
                raw = await result
            else:
                raw = result
        else:
            raw = getattr(request, "_body", None)
        if raw is None:
            return b""
        if isinstance(raw, (bytes, bytearray)):
            return bytes(raw)
        return json.dumps(raw).encode("utf-8")

    clone.json = read_json
    clone.body = read_body
    return clone


def _authorization_secret(request: Any) -> Optional[str]:
    headers = getattr(request, "headers", {}) or {}
    authorization = next((value for key, value in headers.items() if key.lower() == "authorization"), None)
    if not authorization:
        return None
    trimmed = authorization.strip()
    if trimmed.startswith("Bearer "):
        secret = trimmed[len("Bearer "):].strip()
        return secret or None
    if trimmed.startswith("Api-Key "):
        secret = trimmed[len("Api-Key "):].strip()
        return secret or None
    return None


def _require_audience(audience: str, allowlist: Sequence[str]) -> str:
    if audience not in allowlist:
        raise ValidationError("Placement-bound auth context audience is not allowed")
    return audience


def _require_int(name: str, value: Any, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"Placement-context {name} must be an integer")
    if not minimum <= value <= maximum:
        if name == "ttl_seconds":
            raise ConfigError(f"Placement-context ttl_seconds must be between 1 and {MAX_TTL_SECONDS}")
        raise ConfigError(f"Placement-context {name} must be between {minimum} and {maximum}")
    return value


def _credential_version_material(record: Dict[str, Any]) -> str:
    created_at = record.get("createdAt") or record.get("updatedAt")
    return f"{record['id']}:{_isoformat(created_at)}"


def _hmac_opaque(mac_key: bytes, label: str, value: str) -> str:
    # Keyed MAC over identifiers (user/session ids), not password storage.
    # codeql[py/weak-sensitive-data-hashing]
    return _b64(hmac.digest(mac_key, f"{label}:{value}".encode("utf-8"), "sha256"))


def _telemetry_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _secret_bytes(secret: bytes | str) -> bytes:
    return secret.encode("utf-8") if isinstance(secret, str) else bytes(secret)


def _normalize_authority(authority: str) -> str:
    parsed = urlparse(authority)
    if not parsed.scheme or not parsed.hostname:
        raise ConfigError("AuthFn publicAuthority must be a valid origin")
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    port = parsed.port
    if port is None or (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        return f"{scheme}://{hostname}"
    return f"{scheme}://{hostname}:{port}"


def _validate_keyring(keyring: RoutingKeyring) -> None:
    keys: List[RoutingSigningKey] = [keyring.active, *keyring.previous]
    ids: set[str] = set()
    for key in keys:
        secret = _secret_bytes(key.secret)
        if not key.key_id.strip() or len(secret) < 32:
            raise ConfigError("AuthFn routing keys require a keyId and at least 32 bytes of secret material")
        if key.key_id in ids:
            raise ConfigError("AuthFn routing key IDs must be unique")
        ids.add(key.key_id)


def _request_id(request: Any) -> str:
    headers = getattr(request, "headers", {}) or {}
    return next(
        (value for key, value in headers.items() if key.lower() == "x-request-id"),
        f"req_{secrets.token_hex(8)}",
    )


def _isoformat(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        return value
    raise UnauthorizedError(AUTH_REQUIRED)


def _unix(value: str) -> int:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return int(parsed.timestamp())


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


# Re-export for consumers that import the Python error from types.
__all__ = [
    "PlacementBoundAuthContext",
    "PlacementContextInvalidError",
    "PlacementContextIssuer",
    "PlacementContextVerifier",
    "create_placement_context_issuer",
    "create_placement_context_verifier",
]
