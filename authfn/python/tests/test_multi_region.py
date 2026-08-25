"""Multi-region plugin tests for authfn Python."""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import pytest

TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from superfunctions.http import Response

from authfn import (
    AuthFnConfig,
    RegionMismatchError,
    RegionNotFoundError,
    ValidationError,
)
from authfn.plugins import gateway_routing
from authfn.plugins.gateway_routing import (
    CanonicalGateway,
    CanonicalGatewayOptions,
    CanonicalRoutingConfig,
    GatewayCell,
    GatewayIdentity,
    IdentityPlacement,
    InMemoryIdentityPlacementDirectory,
    InMemoryRoutingReplayStore,
    RoutingKeyring,
    RoutingSigningKey,
    create_cell_routing_middleware,
    move_identity_placement,
)
from authfn.plugins.multi_region import (
    MultiRegionPluginConfig,
    MultiRegionRegionConfig,
    MultiRegionService,
    authfn_multi_region_plugin,
)


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "region_profiles": [],
        }

    async def find_one(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> Optional[Dict[str, Any]]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                return row
        return None

    async def create(self, model: str, data: Dict[str, Any], namespace: str) -> Dict[str, Any]:
        self.storage.setdefault(model, []).append(dict(data))
        return self.storage[model][-1]

    async def update(
        self,
        model: str,
        where: List[Dict[str, Any]],
        data: Dict[str, Any],
        namespace: str,
    ) -> Dict[str, Any]:
        for row in self.storage.get(model, []):
            if _matches(row, where):
                row.update(data)
                return row
        raise AssertionError(f"row not found in {model}")


def _matches(row: Dict[str, Any], clauses: List[Dict[str, Any]]) -> bool:
    for clause in clauses:
        operator = clause["operator"]
        field = clause["field"]
        value = clause["value"]
        if operator == "eq" and row.get(field) != value:
            return False
    return True


class RuntimeResolver:
    def resolve(self, request: Any) -> Dict[str, Any]:
        origin = request.url.split("/auth", 1)[0]
        return {
            "issuer": origin,
            "baseUrl": origin,
            "cookie": {
                "prefix": "authfn-base",
                "sameSite": "lax",
            },
            "oauth": {
                "google": {
                    "clientId": "base-google-client",
                    "scopes": ["openid", "email"],
                }
            },
        }


class Request:
    def __init__(self, url: str) -> None:
        self.url = url
        self.headers: Dict[str, str] = {}


class GatewayRequest:
    def __init__(
        self,
        url: str,
        *,
        method: str = "POST",
        body: bytes = b'{"identityKey":"person:ada"}',
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.url = url
        self.method = method
        self.headers = headers or {}
        self._payload = body

    async def body(self) -> bytes:
        return self._payload

    async def json(self) -> Dict[str, Any]:
        import json

        return json.loads(self._payload)


class Directory:
    def __init__(self) -> None:
        self.register_calls: List[Dict[str, Any]] = []

    async def lookup_by_identifier(self, _input: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None

    async def register_user(self, payload: Dict[str, Any]) -> None:
        self.register_calls.append(payload)


def create_plugin_config(directory: Optional[Directory] = None) -> MultiRegionPluginConfig:
    return MultiRegionPluginConfig(
        regions=[
            MultiRegionRegionConfig(
                region_id="us-east-1",
                authority="https://us.account.example.com",
                hosts=["us.account.example.com"],
                cookie={"prefix": "authfn-us"},
                oauth={"google": {"clientId": "us-google-client", "scopes": ["openid", "email", "profile"]}},
            ),
            MultiRegionRegionConfig(
                region_id="eu-west-1",
                authority="https://eu.account.example.com",
                hosts=["eu.account.example.com"],
                domain=".example.com",
                cookie={"prefix": "authfn-eu", "sameSite": "none"},
                oauth={"google": {"clientId": "eu-google-client", "scopes": ["openid", "email", "profile"]}},
            ),
        ],
        directory=directory,
    )


@pytest.mark.asyncio
async def test_multi_region_plugin_schema_routes_and_service_behaviour() -> None:
    plugin = authfn_multi_region_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )
    assert {table["modelName"] for table in schema} == {"region_profiles"}
    assert {(route["method"], route["path"]) for route in routes} == {
        ("POST", "/regions/lookup"),
        ("GET", "/environment"),
        ("GET", "/runtime"),
    }

    db = MockDatabaseAdapter()
    await db.create(
        model="users",
        data={
            "id": "user_1",
            "primaryEmail": "ada@example.com",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        },
        namespace="authfn",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        create_plugin_config(),
    )

    await service.register_user(
        user_id="user_1",
        primary_email="ada@example.com",
        request=Request("https://eu.account.example.com/auth/sign-up/password"),
    )

    runtime = service.resolve_runtime(Request("https://eu.account.example.com/auth/runtime"))
    assert runtime.region_id == "eu-west-1"
    assert runtime.base_url == "https://eu.account.example.com"
    assert runtime.cookie is not None
    assert runtime.cookie.prefix == "authfn-eu"
    assert runtime.cookie.domain == ".example.com"
    assert runtime.cookie.same_site == "none"
    assert runtime.oauth["google"]["clientId"] == "eu-google-client"

    lookup = await service.lookup(
        identifier="ada@example.com",
        request=Request("https://us.account.example.com/auth/regions/lookup"),
    )
    assert lookup == {
        "identifier": "ada@example.com",
        "userId": "user_1",
        "regionId": "eu-west-1",
        "authority": "https://eu.account.example.com",
        "domain": ".example.com",
        "continueLocally": False,
        "redirectTo": "https://eu.account.example.com",
    }

    with pytest.raises(RegionMismatchError) as error:
        await service.ensure_region_alignment(
            user_id="user_1",
            request=Request("https://us.account.example.com/auth/sign-in/password"),
        )
    assert error.value.code == "AUTHFN_REGION_MISMATCH"
    assert error.value.details["redirectTo"] == "https://eu.account.example.com"

    with pytest.raises(RegionNotFoundError) as missing:
        await service.lookup(
            identifier="unknown@example.com",
            request=Request("https://us.account.example.com/auth/regions/lookup"),
        )
    assert missing.value.code == "AUTHFN_REGION_NOT_FOUND"


@pytest.mark.asyncio
async def test_multi_region_registration_updates_local_profile_and_directory() -> None:
    db = MockDatabaseAdapter()
    directory = Directory()
    await db.create(
        model="users",
        data={
            "id": "user_2",
            "primaryEmail": "bea@example.com",
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        },
        namespace="authfn",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        create_plugin_config(directory),
    )

    registered = await service.register_user(
        user_id="user_2",
        primary_email="bea@example.com",
        request=Request("https://us.account.example.com/auth/sign-up/password"),
    )
    assert registered["regionId"] == "us-east-1"
    assert registered["authority"] == "https://us.account.example.com"
    assert len(directory.register_calls) == 1
    assert directory.register_calls[0]["userId"] == "user_2"
    assert db.storage["region_profiles"][0]["regionId"] == "us-east-1"


@pytest.mark.asyncio
async def test_gateway_registration_bypasses_legacy_directory() -> None:
    db = MockDatabaseAdapter()
    directory = Directory()
    plugin_config = create_plugin_config(directory)
    plugin_config.routing = CanonicalRoutingConfig(
        mode="gateway",
        public_authority="https://account.example.com",
        cell_region_id="us-east-1",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        plugin_config,
    )

    registered = await service.register_user(
        user_id="user_gateway",
        primary_email="gateway@example.com",
        request=Request("https://account.example.com/auth/sign-up/password"),
    )

    assert registered is not None
    assert registered["regionId"] == "us-east-1"
    assert registered["authority"] == "https://us.account.example.com"
    assert directory.register_calls == []
    assert db.storage["region_profiles"][0]["userId"] == "user_gateway"


@pytest.mark.asyncio
async def test_canonical_gateway_retries_stale_placement_before_side_effects() -> None:
    fixed_now = time.time()
    directory = InMemoryIdentityPlacementDirectory(
        [
            IdentityPlacement(
                identity_key="person:ada",
                region_id="us-east-1",
                epoch=1,
                updated_at="2026-08-23T00:00:00Z",
            )
        ]
    )
    keyring = RoutingKeyring(
        active=RoutingSigningKey(
            "routing-2026-08", "python-routing-test-secret-with-entropy"
        )
    )
    effects: List[str] = []
    calls: List[str] = []
    replay_expiries: List[int] = []
    claimed_nonces: set[str] = set()
    forwarded_requests: List[GatewayRequest] = []

    class RecordingReplayStore:
        async def claim(self, nonce: str, expires_at: int) -> bool:
            if nonce in claimed_nonces:
                return False
            claimed_nonces.add(nonce)
            replay_expiries.append(expires_at)
            return True

    replay_store = RecordingReplayStore()

    def create_cell(region_id: str):
        routing = CanonicalRoutingConfig(
            mode="gateway",
            public_authority="https://account.example.com",
            placement_directory=directory,
            cell_region_id=region_id,
            cell_audience=f"cell:{region_id}",
            keyring=keyring,
            replay_store=replay_store,
        )
        middleware = create_cell_routing_middleware(routing)

        async def dispatch(request: Any) -> Response:
            async def execute(routed: Any, _context: Any) -> Response:
                assert "x-authfn-routing-attacker" not in {
                    key.lower(): value for key, value in routed.headers.items()
                }
                effects.append(region_id)
                return Response(status=200, body={"executedIn": region_id})

            return await middleware(request, None, execute)

        return dispatch

    cells = {
        "us-east-1": create_cell("us-east-1"),
        "eu-west-1": create_cell("eu-west-1"),
    }

    async def resolve_identity(request: Any, _classification: Any) -> GatewayIdentity:
        assert "x-authfn-routing-attacker" not in {
            key.lower(): value for key, value in request.headers.items()
        }
        body = await request.json()
        return GatewayIdentity(body["identityKey"])

    async def dispatch(target: Any, request: Any) -> Response:
        region_id = next(key for key, value in cells.items() if value is target)
        calls.append(region_id)
        forwarded_requests.append(request)
        return await target(request)

    gateway = CanonicalGateway(
        CanonicalGatewayOptions(
            public_authority="https://account.example.com",
            placement_directory=directory,
            keyring=keyring,
            resolve_identity=resolve_identity,
            select_initial_region=lambda _identity, _request: "us-east-1",
            resolve_cell=lambda region_id: GatewayCell(
                region_id=region_id,
                audience=f"cell:{region_id}",
                target=cells[region_id],
            ),
            dispatch=dispatch,
            placement_cache_ttl_seconds=60,
            clock=lambda: fixed_now,
        )
    )

    first = await gateway.handle(
        GatewayRequest(
            "https://account.example.com/auth/sign-in/password",
            headers={"x-authfn-routing-attacker": "spoofed"},
        )
    )
    assert first.status == 200
    assert first.body == {"executedIn": "us-east-1"}
    assert replay_expiries == [int(fixed_now) + 25]

    replayed = await cells["us-east-1"](forwarded_requests[0])
    assert replayed.status == 401
    assert replayed.body["error"]["code"] == "AUTHFN_ROUTING_ASSERTION_INVALID"
    assert effects == ["us-east-1"]

    moved = await directory.compare_and_set(
        identity_key="person:ada",
        expected_epoch=1,
        expected_state="active",
        placement=IdentityPlacement(
            identity_key="person:ada",
            region_id="eu-west-1",
            epoch=2,
            updated_at="2026-08-23T00:01:00Z",
        ),
    )
    assert moved["updated"] is True

    second = await gateway.handle(
        GatewayRequest("https://account.example.com/auth/sign-in/password")
    )
    assert second.status == 200
    assert second.body == {"executedIn": "eu-west-1"}
    assert calls == ["us-east-1", "us-east-1", "eu-west-1"]
    assert effects == ["us-east-1", "eu-west-1"]

    direct = await cells["eu-west-1"](
        GatewayRequest("https://account.example.com/auth/sign-in/password")
    )
    assert direct.status == 401
    assert direct.body["error"]["code"] == "AUTHFN_ROUTING_ASSERTION_INVALID"

    async def tampered_dispatch(target: Any, request: Any) -> Response:
        request.headers["x-request-id"] = "req_tampered"
        return await target(request)

    gateway.options.dispatch = tampered_dispatch
    tampered = await gateway.handle(
        GatewayRequest(
            "https://account.example.com/auth/sign-in/password",
            headers={"x-request-id": "req_original"},
        )
    )
    assert tampered.status == 401
    assert effects == ["us-east-1", "eu-west-1"]

    def failed_cell_resolution(_region_id: str) -> Any:
        raise RuntimeError("private binding secret")

    gateway.options.resolve_cell = failed_cell_resolution
    unavailable = await gateway.handle(
        GatewayRequest("https://account.example.com/auth/sign-in/password")
    )
    assert unavailable.status == 503
    assert unavailable.body["error"]["code"] == "AUTHFN_ROUTING_CELL_UNAVAILABLE"
    assert unavailable.body["error"]["retryable"] is False
    assert "private binding secret" not in unavailable.body["error"]["message"]


@pytest.mark.asyncio
async def test_gateway_only_runtime_rejects_identity_route_execution() -> None:
    middleware = create_cell_routing_middleware(
        CanonicalRoutingConfig(
            mode="gateway",
            public_authority="https://account.example.com",
            placement_directory=InMemoryIdentityPlacementDirectory(),
        )
    )
    executions = 0

    async def execute(_request: Any, _context: Any) -> Response:
        nonlocal executions
        executions += 1
        return Response(status=200, body={"ok": True})

    global_response = await middleware(
        GatewayRequest("https://account.example.com/auth/environment", method="GET"), None, execute
    )
    identity_response = await middleware(
        GatewayRequest("https://account.example.com/auth/sign-in/password"), None, execute
    )
    assert global_response.status == 200
    assert identity_response.status == 503
    assert executions == 1


def test_gateway_mode_uses_stable_public_runtime_and_canonical_cookie_policy() -> None:
    db = MockDatabaseAdapter()
    config = create_plugin_config()
    config.routing = CanonicalRoutingConfig(
        mode="gateway",
        public_authority="https://account.example.com",
        canonical_cookie={"prefix": "authfn-public", "domain": ".example.com"},
        canonical_oauth={"google": {"clientId": "canonical-google"}},
        placement_directory=InMemoryIdentityPlacementDirectory(),
        cell_region_id="eu-west-1",
    )
    runtime = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        config,
    ).resolve_runtime(Request("https://eu.internal.example/auth/runtime"))
    assert runtime.issuer == "https://account.example.com"
    assert runtime.base_url == "https://account.example.com"
    assert runtime.region_id == "eu-west-1"
    assert runtime.cookie.prefix == "authfn-public"
    assert runtime.cookie.domain == ".example.com"
    assert runtime.oauth["google"]["clientId"] == "canonical-google"


def test_gateway_runtime_rejects_unknown_cell_and_preserves_empty_canonical_oauth() -> None:
    db = MockDatabaseAdapter()
    config = create_plugin_config()
    config.routing = CanonicalRoutingConfig(
        mode="gateway",
        public_authority="https://account.example.com",
        canonical_oauth={},
        placement_directory=InMemoryIdentityPlacementDirectory(),
        cell_region_id="missing-region",
    )
    service = MultiRegionService(
        AuthFnConfig(database=db, namespace="authfn", runtime=RuntimeResolver()),
        config,
    )
    with pytest.raises(ValidationError, match="Gateway cell region"):
        service.resolve_runtime(Request("https://internal.example/auth/runtime"))

    config.regions = []
    runtime = service.resolve_runtime(Request("https://eu.internal.example/auth/runtime"))
    assert runtime.issuer == "https://account.example.com"
    assert runtime.region_id == "missing-region"
    assert runtime.oauth == {}


@pytest.mark.asyncio
async def test_gateway_alignment_uses_canonical_authority_without_legacy_redirect() -> None:
    config = create_plugin_config()
    config.routing = CanonicalRoutingConfig(
        mode="gateway",
        public_authority="https://account.example.com",
        placement_directory=InMemoryIdentityPlacementDirectory(),
        cell_region_id="eu-west-1",
    )
    service = MultiRegionService(
        AuthFnConfig(database=MockDatabaseAdapter(), namespace="authfn", runtime=RuntimeResolver()),
        config,
    )
    alignment = await service.ensure_region_alignment(
        user_id="user_gateway",
        request=Request("https://eu.internal.example/auth/sign-in/password"),
    )
    assert alignment == {"regionId": "eu-west-1"}


@pytest.mark.asyncio
async def test_cell_buffering_preserves_context_url_and_query() -> None:
    middleware = create_cell_routing_middleware(
        CanonicalRoutingConfig(
            mode="gateway",
            public_authority="https://account.example.com",
            placement_directory=InMemoryIdentityPlacementDirectory(),
        )
    )

    class AdapterRequest:
        method = "GET"
        path = "/auth/environment"
        headers: Dict[str, str] = {}
        query_params = {"region": "eu-west-1", "include": ["cookie", "oauth"]}

        async def body(self) -> bytes:
            return b""

    context = type(
        "Context",
        (),
        {"url": "https://account.example.com/auth/environment?region=eu-west-1&include=cookie&include=oauth"},
    )()

    async def execute(request: Any, _context: Any) -> Response:
        assert request.url == context.url
        assert request.query_params == {
            "region": "eu-west-1",
            "include": ["cookie", "oauth"],
        }
        return Response(status=200, body={"ok": True})

    response = await middleware(AdapterRequest(), context, execute)
    assert response.status == 200

    class RawQueryRequest:
        method = "GET"
        path = "/auth/environment"
        headers: Dict[str, str] = {}
        raw_query_string = b"filter=\xff"

        async def body(self) -> bytes:
            return b""

    async def execute_raw(request: Any, _context: Any) -> Response:
        assert request.url == "https://account.example.com/auth/environment?filter=ÿ"
        return Response(status=200, body={"ok": True})

    raw_response = await middleware(RawQueryRequest(), None, execute_raw)
    assert raw_response.status == 200


@pytest.mark.asyncio
async def test_url_less_cell_request_uses_public_authority_and_preserves_raw_query() -> None:
    middleware = create_cell_routing_middleware(
        CanonicalRoutingConfig(
            mode="gateway",
            public_authority="https://login.example.com",
            placement_directory=InMemoryIdentityPlacementDirectory(),
        )
    )

    class AdapterRequest:
        method = "GET"
        path = "/auth/environment"
        headers: Dict[str, str] = {}
        query_params = {"token": ["a/b", "a b"], "x": ""}
        scope = {"query_string": b"token=a%2Fb&token=a+b&x="}

        async def body(self) -> bytes:
            return b""

    async def execute(request: Any, _context: Any) -> Response:
        assert request.url == (
            "https://login.example.com/auth/environment?token=a%2Fb&token=a+b&x="
        )
        return Response(status=200, body={"ok": True})

    response = await middleware(AdapterRequest(), None, execute)
    assert response.status == 200


@pytest.mark.asyncio
async def test_cell_rejects_signed_non_object_payload() -> None:
    directory = InMemoryIdentityPlacementDirectory()
    keyring = RoutingKeyring(
        active=RoutingSigningKey("routing-2026-08", "python-routing-test-secret-with-entropy")
    )
    middleware = create_cell_routing_middleware(
        CanonicalRoutingConfig(
            mode="gateway",
            public_authority="https://account.example.com",
            placement_directory=directory,
            cell_region_id="eu-west-1",
            cell_audience="cell:eu-west-1",
            keyring=keyring,
            replay_store=InMemoryRoutingReplayStore(),
        )
    )
    token = gateway_routing._sign(["not", "an", "object"], keyring)  # type: ignore[arg-type]
    response = await middleware(
        GatewayRequest(
            "https://account.example.com/auth/sign-in/password",
            headers={"x-authfn-routing-assertion": token},
        ),
        None,
        lambda _request, _context: Response(status=200),
    )
    assert response.status == 401
    assert response.body["error"]["code"] == "AUTHFN_ROUTING_ASSERTION_INVALID"


@pytest.mark.asyncio
async def test_move_keeps_placement_fenced_when_target_resume_fails() -> None:
    directory = InMemoryIdentityPlacementDirectory(
        [IdentityPlacement("person:ada", "us-east-1", 3, updated_at="2026-08-23T00:00:00Z")]
    )

    async def ok() -> None:
        return None

    async def fail_target() -> None:
        raise RuntimeError("target unavailable")

    with pytest.raises(RuntimeError, match="target unavailable"):
        await move_identity_placement(
            directory,
            identity_key="person:ada",
            source_region_id="us-east-1",
            target_region_id="eu-west-1",
            quiesce_source=ok,
            drain_source=ok,
            copy_to_target=ok,
            validate_target=ok,
            warm_target=ok,
            resume_target=fail_target,
        )
    placement = await directory.get("person:ada")
    assert placement is not None
    assert (placement.state, placement.epoch) == ("moving", 4)


@pytest.mark.asyncio
async def test_move_does_not_publish_source_when_source_resume_fails() -> None:
    directory = InMemoryIdentityPlacementDirectory(
        [IdentityPlacement("person:ada", "us-east-1", 7, updated_at="2026-08-23T00:00:00Z")]
    )

    async def ok() -> None:
        return None

    async def fail_copy() -> None:
        raise RuntimeError("copy failed")

    async def fail_source() -> None:
        raise RuntimeError("source unavailable")

    with pytest.raises(RuntimeError, match="source unavailable"):
        await move_identity_placement(
            directory,
            identity_key="person:ada",
            source_region_id="us-east-1",
            target_region_id="eu-west-1",
            quiesce_source=ok,
            drain_source=ok,
            copy_to_target=fail_copy,
            validate_target=ok,
            warm_target=ok,
            resume_target=ok,
            resume_source=fail_source,
        )
    placement = await directory.get("person:ada")
    assert placement is not None
    assert (placement.state, placement.epoch) == ("moving", 8)


@pytest.mark.asyncio
async def test_move_keeps_placement_fenced_when_activation_cas_fails() -> None:
    class ActivationRaceDirectory(InMemoryIdentityPlacementDirectory):
        async def compare_and_set(
            self,
            *,
            identity_key: str,
            expected_epoch: int,
            expected_state: str,
            placement: IdentityPlacement,
        ) -> Dict[str, Any]:
            if expected_state == "moving":
                return {"updated": False, "existing": await self.get(identity_key)}
            return await super().compare_and_set(
                identity_key=identity_key,
                expected_epoch=expected_epoch,
                expected_state=expected_state,
                placement=placement,
            )

    directory = ActivationRaceDirectory(
        [IdentityPlacement("person:ada", "us-east-1", 11, updated_at="2026-08-23T00:00:00Z")]
    )
    source_resumes = 0

    async def ok() -> None:
        return None

    async def resume_source() -> None:
        nonlocal source_resumes
        source_resumes += 1

    with pytest.raises(RegionMismatchError, match="changed before activation"):
        await move_identity_placement(
            directory,
            identity_key="person:ada",
            source_region_id="us-east-1",
            target_region_id="eu-west-1",
            quiesce_source=ok,
            drain_source=ok,
            copy_to_target=ok,
            validate_target=ok,
            warm_target=ok,
            resume_target=ok,
            resume_source=resume_source,
        )

    placement = await directory.get("person:ada")
    assert placement is not None
    assert (placement.state, placement.epoch) == ("moving", 12)
    assert source_resumes == 0
