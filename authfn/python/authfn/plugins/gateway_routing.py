"""Canonical-gateway routing primitives shared by AuthFn Python adapters."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import json
import secrets
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol, cast
from urllib.parse import parse_qs, urlencode, urlparse

from superfunctions.http import Response

from ..types import (
    AuthFnError,
    ConfigError,
    PlacementDirectoryUnavailableError,
    PlacementMovingError,
    RegionMismatchError,
    RegionNotFoundError,
    RoutingAssertionInvalidError,
    RoutingCellUnavailableError,
    ValidationError,
)

ASSERTION_HEADER = "x-authfn-routing-assertion"
MISMATCH_HEADER = "x-authfn-routing-mismatch"
INTERNAL_HEADER_PREFIX = "x-authfn-routing-"


@dataclass
class IdentityPlacement:
    identity_key: str
    region_id: str
    epoch: int
    state: str = "active"
    moving_to_region_id: Optional[str] = None
    previous_region_id: Optional[str] = None
    updated_at: str = ""


class IdentityPlacementDirectory(Protocol):
    """Linearizable placement reads, first claims, and epoch/state CAS across all writers."""

    async def get(self, identity_key: str) -> Optional[IdentityPlacement]: ...

    async def put_if_absent(self, placement: IdentityPlacement) -> Dict[str, Any]: ...

    async def compare_and_set(
        self,
        *,
        identity_key: str,
        expected_epoch: int,
        expected_state: str,
        placement: IdentityPlacement,
    ) -> Dict[str, Any]: ...


class InMemoryIdentityPlacementDirectory:
    """Deterministic atomic directory for tests and single-process deployments."""

    def __init__(self, initial: Optional[List[IdentityPlacement]] = None):
        for entry in initial or []:
            _validate_placement(entry)
        self._records = {entry.identity_key: _copy_placement(entry) for entry in initial or []}
        self._lock = asyncio.Lock()

    async def get(self, identity_key: str) -> Optional[IdentityPlacement]:
        async with self._lock:
            value = self._records.get(identity_key)
            return _copy_placement(value) if value else None

    async def put_if_absent(self, placement: IdentityPlacement) -> Dict[str, Any]:
        _validate_placement(placement)
        async with self._lock:
            existing = self._records.get(placement.identity_key)
            if existing:
                return {"inserted": False, "existing": _copy_placement(existing)}
            self._records[placement.identity_key] = _copy_placement(placement)
            return {"inserted": True}

    async def compare_and_set(
        self,
        *,
        identity_key: str,
        expected_epoch: int,
        expected_state: str,
        placement: IdentityPlacement,
    ) -> Dict[str, Any]:
        _validate_placement(placement)
        if placement.identity_key != identity_key:
            raise ValidationError("Placement identity key must match the compare-and-set key")
        async with self._lock:
            existing = self._records.get(identity_key)
            if not existing or existing.epoch != expected_epoch or existing.state != expected_state:
                return {
                    "updated": False,
                    "existing": _copy_placement(existing) if existing else None,
                }
            self._records[identity_key] = _copy_placement(placement)
            return {"updated": True}


@dataclass(frozen=True)
class RoutingSigningKey:
    key_id: str
    secret: bytes | str


@dataclass(frozen=True)
class RoutingKeyring:
    active: RoutingSigningKey
    previous: List[RoutingSigningKey] = field(default_factory=list)


class InMemoryRoutingReplayStore:
    def __init__(self, clock: Callable[[], float] = time.time):
        self._clock = clock
        self._claims: Dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def claim(self, nonce: str, expires_at: int) -> bool:
        async with self._lock:
            now = int(self._clock())
            self._claims = {key: expiry for key, expiry in self._claims.items() if expiry >= now}
            if nonce in self._claims:
                return False
            self._claims[nonce] = expires_at
            return True


@dataclass
class CanonicalRoutingConfig:
    mode: str = "direct"
    public_authority: Optional[str] = None
    canonical_cookie: Optional[Dict[str, Any]] = None
    canonical_oauth: Optional[Dict[str, Dict[str, Any]]] = None
    placement_directory: Optional[IdentityPlacementDirectory] = None
    identity_key_for_identifier: Optional[Callable[[str], str]] = None
    cell_region_id: Optional[str] = None
    cell_audience: Optional[str] = None
    keyring: Optional[RoutingKeyring] = None
    replay_store: Optional[Any] = None
    clock_skew_seconds: int = 5


@dataclass(frozen=True)
class RouteClassification:
    scope: str
    family: str


@dataclass(frozen=True)
class GatewayIdentity:
    identity_key: str
    preferred_region_id: Optional[str] = None
    allow_initial_placement: bool = False


@dataclass(frozen=True)
class GatewayCell:
    region_id: str
    audience: str
    target: Any


@dataclass
class CanonicalGatewayOptions:
    public_authority: str
    placement_directory: IdentityPlacementDirectory
    keyring: RoutingKeyring
    resolve_identity: Callable[[Any, RouteClassification], Any]
    select_initial_region: Callable[[GatewayIdentity, Any], Any]
    resolve_cell: Callable[[str], Any]
    dispatch: Callable[[Any, Any], Awaitable[Response]]
    handle_global: Optional[Callable[[Any, RouteClassification], Any]] = None
    base_path: str = "/auth"
    assertion_ttl_seconds: int = 20
    placement_cache_ttl_seconds: float = 5.0
    placement_cache_max_entries: int = 10_000
    clock_skew_seconds: int = 5
    clock: Callable[[], float] = time.time


class CanonicalGateway:
    """Public stable authority that forwards only to adapter-owned cell targets."""

    def __init__(self, options: CanonicalGatewayOptions):
        _validate_keyring(options.keyring)
        if not 1 <= options.assertion_ttl_seconds <= 300:
            raise ConfigError("AuthFn assertion TTL must be between 1 and 300 seconds")
        if options.placement_cache_ttl_seconds < 0:
            raise ConfigError("AuthFn placement cache TTL must be non-negative")
        if options.placement_cache_max_entries < 1:
            raise ConfigError("AuthFn placement cache maximum must be positive")
        if not 0 <= options.clock_skew_seconds <= 60:
            raise ConfigError("AuthFn gateway clock skew must be between 0 and 60 seconds")
        self.options = options
        self.public_authority = _normalize_authority(options.public_authority)
        self.base_path = _normalize_base_path(options.base_path)
        self._cache: Dict[str, tuple[IdentityPlacement, float]] = {}

    def invalidate(self, identity_key: str) -> None:
        self._cache.pop(identity_key, None)

    def _cache_placement(self, identity_key: str, placement: IdentityPlacement) -> None:
        current = self.options.clock()
        self.invalidate(identity_key)
        while len(self._cache) >= self.options.placement_cache_max_entries:
            self._cache.pop(next(iter(self._cache)))
        self._cache[identity_key] = (
            _copy_placement(placement),
            current + self.options.placement_cache_ttl_seconds,
        )

    async def handle(self, request: Any) -> Response:
        buffered = await _buffer_request(
            request, fallback_authority=self.public_authority
        )
        if _request_origin(buffered) != self.public_authority:
            return _error_response(buffered, ValidationError("AuthFn gateway accepts only its public authority"))
        classification = classify_route(buffered, self.base_path)
        try:
            sanitized = _strip_routing_headers(buffered)
            if classification.scope == "global":
                if not self.options.handle_global:
                    return _error_response(
                        buffered, RegionNotFoundError("Global AuthFn route is not configured")
                    )
                response = await _maybe_await(
                    self.options.handle_global(sanitized, classification)
                )
                return _strip_response_headers(response)
            identity = await _maybe_await(self.options.resolve_identity(sanitized, classification))
            if not identity or not identity.identity_key.strip():
                return _error_response(
                    buffered, ValidationError("A trusted identity routing key is required")
                )
            identity = GatewayIdentity(
                identity.identity_key.strip(),
                identity.preferred_region_id,
                identity.allow_initial_placement,
            )
            placement = await self._resolve_or_claim(identity, sanitized, bypass_cache=False)
            return await self._forward(sanitized, identity, placement, attempt=0)
        except Exception as error:  # noqa: BLE001
            return _error_response(buffered, error)

    async def _load(self, identity_key: str, bypass_cache: bool) -> Optional[IdentityPlacement]:
        cached = self._cache.get(identity_key)
        if not bypass_cache and cached and cached[1] > self.options.clock():
            return _copy_placement(cached[0])
        try:
            placement = await self.options.placement_directory.get(identity_key)
        except Exception as error:  # noqa: BLE001
            raise PlacementDirectoryUnavailableError("Identity placement directory is unavailable") from error
        if placement:
            self._cache_placement(identity_key, placement)
        else:
            self.invalidate(identity_key)
        return placement

    async def _resolve_or_claim(
        self,
        identity: GatewayIdentity,
        request: Any,
        *,
        bypass_cache: bool,
    ) -> IdentityPlacement:
        placement = await self._load(identity.identity_key, bypass_cache)
        if placement:
            return _require_active(placement)
        if not identity.allow_initial_placement:
            raise RegionNotFoundError("Identity placement is not active")
        region_id = await _maybe_await(self.options.select_initial_region(identity, request))
        if not region_id:
            raise RoutingCellUnavailableError("Initial region selection returned no cell")
        claimed = IdentityPlacement(
            identity_key=identity.identity_key,
            region_id=region_id,
            epoch=1,
            updated_at=_iso_now(self.options.clock),
        )
        try:
            result = await self.options.placement_directory.put_if_absent(claimed)
        except Exception as error:  # noqa: BLE001
            raise PlacementDirectoryUnavailableError("Identity placement directory is unavailable") from error
        placement = claimed if result.get("inserted") else result.get("existing")
        if not placement:
            raise PlacementDirectoryUnavailableError("Placement claim returned no record")
        self._cache_placement(identity.identity_key, placement)
        return _require_active(placement)

    async def _forward(
        self,
        request: Any,
        identity: GatewayIdentity,
        placement: IdentityPlacement,
        *,
        attempt: int,
    ) -> Response:
        cell = await _maybe_await(self.options.resolve_cell(placement.region_id))
        if not cell or cell.region_id != placement.region_id:
            return _error_response(request, RoutingCellUnavailableError())
        issued_at = int(self.options.clock())
        parsed_url = urlparse(request.url)
        payload = {
            "kind": "request",
            "keyId": self.options.keyring.active.key_id,
            "identityKey": identity.identity_key,
            "regionId": placement.region_id,
            "epoch": placement.epoch,
            "requestId": _request_id(request),
            "method": request.method,
            "path": _path_and_query(parsed_url),
            "audience": cell.audience,
            "issuedAt": issued_at,
            "expiresAt": issued_at + self.options.assertion_ttl_seconds,
            "nonce": secrets.token_urlsafe(18),
            "bodySha256": _body_digest(request._body),
        }
        routed = _strip_routing_headers(request)
        routed.headers[ASSERTION_HEADER] = _sign(payload, self.options.keyring)
        try:
            response = await self.options.dispatch(cell.target, routed)
        except Exception:  # noqa: BLE001
            return _error_response(request, RoutingCellUnavailableError())
        mismatch_token = _header(response.headers, MISMATCH_HEADER)
        if attempt == 0 and mismatch_token:
            try:
                mismatch = _verify(
                    mismatch_token,
                    self.options.keyring,
                    self.options.clock,
                    self.options.clock_skew_seconds,
                )
            except RoutingAssertionInvalidError:
                mismatch = {}
            if (
                mismatch.get("kind") == "mismatch"
                and mismatch.get("executionStarted") is False
                and mismatch.get("identityKey") == identity.identity_key
                and mismatch.get("requestId") == _request_id(request)
                and mismatch.get("receivedRegionId") == placement.region_id
                and mismatch.get("receivedEpoch") == placement.epoch
            ):
                self.invalidate(identity.identity_key)
                refreshed = await self._resolve_or_claim(identity, request, bypass_cache=True)
                return await self._forward(request, identity, refreshed, attempt=1)
        return _strip_response_headers(response)


def create_cell_routing_middleware(
    routing: CanonicalRoutingConfig,
    *,
    base_path: str = "/auth",
) -> Callable[[Any, Any, Callable[..., Any]], Awaitable[Response]]:
    if routing.mode != "gateway":
        raise ConfigError("Cell routing middleware requires gateway mode")
    directory = routing.placement_directory
    cell_region_id = routing.cell_region_id
    cell_audience = routing.cell_audience
    keyring = routing.keyring
    replay_store = routing.replay_store
    if directory is None:
        raise ConfigError("Gateway-mode AuthFn requires a placement directory")
    cell_values = [cell_region_id, cell_audience, keyring, replay_store]
    if not any(value is not None for value in cell_values):
        async def gateway_only_middleware(
            request: Any,
            context: Any,
            next_handler: Callable[..., Any],
        ) -> Response:
            buffered = await _buffer_request(
                request, context, fallback_authority=routing.public_authority
            )
            if classify_route(buffered, base_path).scope == "global":
                return cast(Response, await next_handler(buffered, context))
            return _error_response(buffered, RoutingCellUnavailableError())

        return gateway_only_middleware
    if any(value is None for value in cell_values):
        raise ConfigError("Gateway-mode AuthFn cells require region, audience, keyring, and replay store")
    assert cell_region_id is not None
    assert cell_audience is not None
    assert keyring is not None
    assert replay_store is not None
    _validate_keyring(keyring)
    if not 0 <= routing.clock_skew_seconds <= 60:
        raise ConfigError("AuthFn cell clock skew must be between 0 and 60 seconds")

    async def middleware(request: Any, context: Any, next_handler: Callable[..., Any]) -> Response:
        buffered = await _buffer_request(
            request, context, fallback_authority=routing.public_authority
        )
        if classify_route(buffered, base_path).scope == "global":
            return cast(Response, await next_handler(buffered, context))
        try:
            token = _header(buffered.headers, ASSERTION_HEADER)
            if not token:
                raise RoutingAssertionInvalidError("Gateway routing assertion is required")
            payload = _verify(token, keyring, time.time, routing.clock_skew_seconds)
            if payload.get("kind") != "request":
                raise RoutingAssertionInvalidError()
            if (
                payload.get("audience") != cell_audience
                or payload.get("requestId") != _request_id(buffered)
                or payload.get("method") != buffered.method
                or payload.get("path") != _path_and_query(urlparse(buffered.url))
                or payload.get("bodySha256") != _body_digest(buffered._body)
            ):
                raise RoutingAssertionInvalidError("Gateway routing assertion does not match request")
            if not await replay_store.claim(payload["nonce"], payload["expiresAt"]):
                raise RoutingAssertionInvalidError("Gateway routing assertion was replayed")
            try:
                placement = await directory.get(payload["identityKey"])
            except Exception as error:  # noqa: BLE001
                raise PlacementDirectoryUnavailableError("Identity placement directory is unavailable") from error
            if not placement or placement.state == "tombstoned":
                raise RegionNotFoundError("Identity placement is not active")
            if placement.state == "moving":
                raise PlacementMovingError("Identity placement is moving", {"executionStarted": False})
            if (
                placement.region_id != cell_region_id
                or payload.get("regionId") != cell_region_id
                or payload.get("epoch") != placement.epoch
            ):
                now = int(time.time())
                mismatch = {
                    "kind": "mismatch",
                    "keyId": keyring.active.key_id,
                    "identityKey": payload["identityKey"],
                    "requestId": payload["requestId"],
                    "receivedRegionId": payload["regionId"],
                    "receivedEpoch": payload["epoch"],
                    "expectedRegionId": placement.region_id,
                    "expectedEpoch": placement.epoch,
                    "executionStarted": False,
                    "issuedAt": now,
                    "expiresAt": now + 20,
                    "nonce": secrets.token_urlsafe(18),
                }
                response = _error_response(
                    buffered,
                    RegionMismatchError(
                        "Gateway routing placement is stale",
                        {"executionStarted": False},
                    ),
                )
                response.headers[MISMATCH_HEADER] = _sign(mismatch, keyring)
                return response
            return cast(Response, await next_handler(buffered, context))
        except Exception as error:  # noqa: BLE001
            return _error_response(buffered, error)

    return middleware


def classify_route(request: Any, base_path: str = "/auth") -> RouteClassification:
    path = urlparse(request.url).path
    normalized_base = _normalize_base_path(base_path)
    if normalized_base != "/" and (path == normalized_base or path.startswith(f"{normalized_base}/")):
        path = path[len(normalized_base) :] or "/"
    method = str(request.method).upper()
    if method == "GET" and (
        path in {"/runtime", "/environment", "/discovery", "/.well-known"}
        or path.startswith("/.well-known/")
    ):
        return RouteClassification("global", "discovery")
    if method == "POST" and path == "/regions/lookup":
        return RouteClassification("global", "region-lookup")
    if path.startswith("/otp/") or "password/reset" in path:
        return RouteClassification("identity", "otp")
    if path.startswith("/sessions") or path in {"/session", "/sign-out"}:
        return RouteClassification("identity", "session")
    if path.startswith("/api-keys"):
        return RouteClassification("identity", "api-key")
    if path.startswith("/oauth") or path.startswith("/social"):
        return RouteClassification("identity", "oauth")
    if path.startswith("/handoff"):
        return RouteClassification("identity", "handoff")
    if path.startswith("/account"):
        return RouteClassification("identity", "account")
    return RouteClassification("identity", "auth")


async def move_identity_placement(
    directory: IdentityPlacementDirectory,
    *,
    identity_key: str,
    source_region_id: str,
    target_region_id: str,
    quiesce_source: Callable[[], Any],
    drain_source: Callable[[], Any],
    copy_to_target: Callable[[], Any],
    validate_target: Callable[[], Any],
    warm_target: Callable[[], Any],
    resume_target: Callable[[], Any],
    resume_source: Optional[Callable[[], Any]] = None,
) -> IdentityPlacement:
    current = await directory.get(identity_key)
    if not current or current.state != "active" or current.region_id != source_region_id:
        raise RegionMismatchError("Identity is not active in the migration source")
    moving = IdentityPlacement(
        identity_key=identity_key,
        region_id=source_region_id,
        epoch=current.epoch + 1,
        state="moving",
        moving_to_region_id=target_region_id,
        previous_region_id=source_region_id,
        updated_at=_iso_now(time.time),
    )
    fenced = await directory.compare_and_set(
        identity_key=identity_key,
        expected_epoch=current.epoch,
        expected_state="active",
        placement=moving,
    )
    if not fenced.get("updated"):
        raise RegionMismatchError("Identity placement changed during migration")
    try:
        for callback in [quiesce_source, drain_source, copy_to_target, validate_target, warm_target]:
            await _maybe_await(callback())
        await _maybe_await(resume_target())
        active = IdentityPlacement(
            identity_key=identity_key,
            region_id=target_region_id,
            epoch=moving.epoch + 1,
            previous_region_id=source_region_id,
            updated_at=_iso_now(time.time),
        )
        result = await directory.compare_and_set(
            identity_key=identity_key,
            expected_epoch=moving.epoch,
            expected_state="moving",
            placement=active,
        )
        if not result.get("updated"):
            raise RegionMismatchError("Identity placement changed before activation")
        return active
    except Exception as error:
        if resume_source is None:
            raise
        await _maybe_await(resume_source())
        rollback = IdentityPlacement(
            identity_key=identity_key,
            region_id=source_region_id,
            epoch=moving.epoch + 1,
            previous_region_id=target_region_id,
            updated_at=_iso_now(time.time),
        )
        rolled_back = await directory.compare_and_set(
            identity_key=identity_key,
            expected_epoch=moving.epoch,
            expected_state="moving",
            placement=rollback,
        )
        if not rolled_back.get("updated"):
            raise RegionMismatchError(
                "Identity placement rollback lost its compare-and-set race"
            ) from error
        raise


@dataclass
class _BufferedRequest:
    method: str
    url: str
    headers: Dict[str, str]
    _body: bytes

    @property
    def path(self) -> str:
        return urlparse(self.url).path

    @property
    def query_params(self) -> Dict[str, Any]:
        parsed = parse_qs(urlparse(self.url).query, keep_blank_values=True)
        return {
            key: values[0] if len(values) == 1 else values
            for key, values in parsed.items()
        }

    async def body(self) -> bytes:
        return self._body

    async def text(self) -> str:
        return self._body.decode("utf-8")

    async def json(self) -> Any:
        return json.loads(await self.text()) if self._body else {}


async def _buffer_request(
    request: Any,
    context: Any = None,
    *,
    fallback_authority: Optional[str] = None,
) -> _BufferedRequest:
    if isinstance(request, _BufferedRequest):
        return _BufferedRequest(request.method, request.url, dict(request.headers), request._body)
    body_method = getattr(request, "body", None)
    if callable(body_method):
        body = await _maybe_await(body_method())
    else:
        body = getattr(request, "_body", b"")
    if isinstance(body, str):
        body = body.encode("utf-8")
    headers = dict(getattr(request, "headers", {}) or {})
    if not _header(headers, "x-request-id"):
        headers["x-request-id"] = f"req_{secrets.token_hex(8)}"
    request_url = getattr(request, "url", None) or getattr(context, "url", None)
    if not request_url:
        path = str(getattr(request, "path", "/"))
        if fallback_authority:
            request_url = f"{_normalize_authority(fallback_authority)}{path}"
        else:
            host = _header(headers, "x-forwarded-host") or _header(headers, "host")
            if not host:
                raise ConfigError(
                    "URL-less AuthFn requests require a public authority or trusted host header"
                )
            scheme = _header(headers, "x-forwarded-proto") or "https"
            request_url = f"{scheme}://{host}{path}"
        encoded_query = _raw_query_string(request, context)
        if encoded_query is None:
            query = getattr(request, "query_params", {}) or {}
            encoded_query = urlencode(query, doseq=True)
        if encoded_query:
            request_url = f"{request_url}?{encoded_query}"
    return _BufferedRequest(
        method=str(getattr(request, "method", "GET")).upper(),
        url=str(request_url),
        headers=headers,
        _body=bytes(body or b""),
    )


def _raw_query_string(request: Any, context: Any = None) -> Optional[str]:
    for source in (request, context):
        if source is None:
            continue
        for attribute in ("raw_query_string", "query_string"):
            value = getattr(source, attribute, None)
            if isinstance(value, bytes):
                return value.decode("ascii")
            if isinstance(value, str):
                return value.lstrip("?")
        scope = getattr(source, "scope", None)
        if isinstance(scope, dict):
            value = scope.get("query_string")
            if isinstance(value, bytes):
                return value.decode("ascii")
            if isinstance(value, str):
                return value.lstrip("?")
    return None


def _strip_routing_headers(request: _BufferedRequest) -> _BufferedRequest:
    headers = {
        key: value
        for key, value in request.headers.items()
        if not key.lower().startswith(INTERNAL_HEADER_PREFIX)
    }
    return _BufferedRequest(request.method, request.url, headers, request._body)


def _strip_response_headers(response: Response) -> Response:
    return response.model_copy(
        update={
            "headers": {
                key: value
                for key, value in response.headers.items()
                if not key.lower().startswith(INTERNAL_HEADER_PREFIX)
            }
        }
    )


def _sign(payload: Dict[str, Any], keyring: RoutingKeyring) -> str:
    encoded = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    secret = _secret_bytes(keyring.active.secret)
    signature = _b64(hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def _verify(
    token: str,
    keyring: RoutingKeyring,
    clock: Callable[[], float],
    clock_skew_seconds: int = 0,
) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 2:
        raise RoutingAssertionInvalidError()
    encoded, signature = parts
    try:
        decoded = json.loads(_unb64(encoded).decode("utf-8"))
    except Exception as error:  # noqa: BLE001
        raise RoutingAssertionInvalidError() from error
    if not isinstance(decoded, dict):
        raise RoutingAssertionInvalidError()
    payload = cast(Dict[str, Any], decoded)
    _validate_signed_payload(payload)
    key = next(
        (entry for entry in [keyring.active, *keyring.previous] if entry.key_id == payload.get("keyId")),
        None,
    )
    if not key:
        raise RoutingAssertionInvalidError("Gateway routing assertion key is unknown")
    expected = hmac.new(_secret_bytes(key.secret), encoded.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(_unb64(signature), expected):
        raise RoutingAssertionInvalidError()
    now = int(clock())
    if payload.get("issuedAt", now + clock_skew_seconds + 1) > now + clock_skew_seconds:
        raise RoutingAssertionInvalidError("Gateway routing assertion is expired")
    if payload.get("expiresAt", 0) < now - clock_skew_seconds:
        raise RoutingAssertionInvalidError("Gateway routing assertion is expired")
    return payload


def _error_response(request: Any, error: Any) -> Response:
    auth_error = (
        error
        if isinstance(error, AuthFnError)
        else RoutingCellUnavailableError("Regional AuthFn cell is unavailable")
    )
    request_id = _request_id(request)
    return Response(
        status=auth_error.status,
        headers={"content-type": "application/json", "x-request-id": request_id},
        body={
            "ok": False,
            "error": {
                "code": auth_error.code,
                "message": str(auth_error),
                "retryable": auth_error.retryable,
                "details": auth_error.details,
            },
            "requestId": request_id,
        },
    )


def _request_id(request: Any) -> str:
    return _header(getattr(request, "headers", {}), "x-request-id") or f"req_{secrets.token_hex(8)}"


def _request_origin(request: Any) -> str:
    parsed = urlparse(request.url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _body_digest(body: bytes) -> str:
    return _b64(hashlib.sha256(body).digest())


def _path_and_query(parsed_url: Any) -> str:
    return f"{parsed_url.path}?{parsed_url.query}" if parsed_url.query else parsed_url.path


def _header(headers: Dict[str, str], name: str) -> Optional[str]:
    return next((value for key, value in headers.items() if key.lower() == name.lower()), None)


def _normalize_authority(authority: str) -> str:
    parsed = urlparse(authority)
    if not parsed.scheme or not parsed.netloc:
        raise ConfigError("AuthFn public authority must be a valid origin")
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalize_base_path(base_path: str) -> str:
    normalized = base_path.rstrip("/") or "/"
    if not normalized.startswith("/") or "?" in normalized or "#" in normalized:
        raise ConfigError("AuthFn base path must be an absolute URL path")
    return normalized


def _require_active(placement: IdentityPlacement) -> IdentityPlacement:
    if placement.state == "moving":
        raise PlacementMovingError("Identity placement is moving", {"executionStarted": False})
    if placement.state != "active":
        raise RegionNotFoundError("Identity placement is not active")
    return placement


def _validate_placement(placement: IdentityPlacement) -> None:
    if not placement.identity_key or not placement.region_id or placement.epoch < 1:
        raise ValidationError("Identity placement is invalid")
    if placement.state not in {"active", "moving", "tombstoned"}:
        raise ValidationError("Identity placement state is invalid")


def _copy_placement(placement: IdentityPlacement) -> IdentityPlacement:
    return IdentityPlacement(**asdict(placement))


def _secret_bytes(secret: bytes | str) -> bytes:
    return secret if isinstance(secret, bytes) else secret.encode("utf-8")


def _validate_signed_payload(payload: Dict[str, Any]) -> None:
    issued_at = payload.get("issuedAt")
    expires_at = payload.get("expiresAt")
    if (
        not isinstance(payload.get("keyId"), str)
        or not isinstance(issued_at, int)
        or not isinstance(expires_at, int)
        or not isinstance(payload.get("nonce"), str)
        or len(payload["nonce"]) < 16
        or expires_at < issued_at
        or expires_at - issued_at > 300
    ):
        raise RoutingAssertionInvalidError()
    if payload.get("kind") == "request":
        fields = ["identityKey", "regionId", "requestId", "method", "path", "audience", "bodySha256"]
        if not all(isinstance(payload.get(field), str) for field in fields):
            raise RoutingAssertionInvalidError()
        if not isinstance(payload.get("epoch"), int) or payload["epoch"] < 1:
            raise RoutingAssertionInvalidError()
        return
    if payload.get("kind") == "mismatch":
        fields = ["identityKey", "requestId", "receivedRegionId", "expectedRegionId"]
        if not all(isinstance(payload.get(field), str) for field in fields):
            raise RoutingAssertionInvalidError()
        if not isinstance(payload.get("receivedEpoch"), int) or not isinstance(
            payload.get("expectedEpoch"), int
        ):
            raise RoutingAssertionInvalidError()
        if payload.get("executionStarted") is not False:
            raise RoutingAssertionInvalidError()
        return
    raise RoutingAssertionInvalidError()


def _validate_keyring(keyring: RoutingKeyring) -> None:
    identifiers = set()
    for key in [keyring.active, *keyring.previous]:
        if not key.key_id.strip() or len(_secret_bytes(key.secret)) < 32:
            raise ConfigError(
                "AuthFn routing keys require a key id and at least 32 bytes of secret material"
            )
        if key.key_id in identifiers:
            raise ConfigError("AuthFn routing key ids must be unique")
        identifiers.add(key.key_id)


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _iso_now(clock: Callable[[], float]) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(clock(), tz=timezone.utc).isoformat().replace("+00:00", "Z")


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


__all__ = [
    "CanonicalGateway",
    "CanonicalGatewayOptions",
    "CanonicalRoutingConfig",
    "GatewayCell",
    "GatewayIdentity",
    "IdentityPlacement",
    "IdentityPlacementDirectory",
    "InMemoryIdentityPlacementDirectory",
    "InMemoryRoutingReplayStore",
    "RouteClassification",
    "RoutingKeyring",
    "RoutingSigningKey",
    "classify_route",
    "create_cell_routing_middleware",
    "move_identity_placement",
]
