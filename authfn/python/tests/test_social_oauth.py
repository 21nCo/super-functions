"""Social OAuth plugin tests for authfn Python."""

from __future__ import annotations

import base64
import json
import os
import sys
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

from authfn import (
    AuthFnConfig,
    AuthFnHooks,
    InternalError,
    OAuthCallbackInvalidError,
    OAuthProviderUnsupportedError,
    OAuthStateReplayedError,
    RateLimitedError,
    RedirectUriDisallowedError,
)
from authfn.plugins.multi_region import (
    MultiRegionPluginConfig,
    MultiRegionRegionConfig,
    authfn_multi_region_plugin,
)
from authfn.plugins.social_oauth import (
    SocialOAuthPluginConfig,
    SocialOAuthService,
    SocialProviderConfig,
    authfn_social_oauth_plugin,
)


def create_id_token(claims: Dict[str, Any]) -> str:
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "none", "typ": "JWT"}).encode("utf-8")
    ).decode("utf-8").rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).decode("utf-8").rstrip("=")
    return f"{header}.{payload}.signature"


class MockResponse:
    def __init__(self, status: int, body: Any):
        self.status = status
        self.ok = 200 <= status < 300
        self._body = body

    async def text(self) -> str:
        if isinstance(self._body, str):
            return self._body
        return json.dumps(self._body)


class MockDatabaseAdapter:
    def __init__(self) -> None:
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "oauth_states": [],
            "oauth_tokens": [],
            "oauth_accounts": [],
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

    async def find_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        order_by: Optional[List[Dict[str, Any]]] = None,
        namespace: str = "authfn",
    ) -> List[Dict[str, Any]]:
        rows = [row for row in self.storage.get(model, []) if _matches(row, where)]
        if order_by:
            for entry in reversed(order_by):
                reverse = entry["direction"] == "desc"
                rows.sort(key=lambda item: item.get(entry["field"]), reverse=reverse)
        return rows

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

    async def delete_many(
        self,
        model: str,
        where: List[Dict[str, Any]],
        namespace: str,
    ) -> int:
        rows = self.storage.get(model, [])
        retained = [row for row in rows if not _matches(row, where)]
        deleted = len(rows) - len(retained)
        self.storage[model] = retained
        return deleted


def _matches(row: Dict[str, Any], clauses: List[Dict[str, Any]]) -> bool:
    for clause in clauses:
        operator = clause["operator"]
        field = clause["field"]
        value = clause["value"]
        if operator == "eq" and row.get(field) != value:
            return False
        if operator == "lt" and not (row.get(field) < value):
            return False
    return True


class FixedClock:
    def __init__(self, start: datetime) -> None:
        self.current = start

    def now(self) -> datetime:
        return self.current


class RuntimeResolver:
    def __init__(self, oauth: Dict[str, Dict[str, Any]]) -> None:
        self.oauth = oauth

    def resolve(self, _request: Any) -> Any:
        origin = "https://account.example.com"
        if _request is not None and getattr(_request, "url", None):
            origin = _request.url.split("/auth", 1)[0]
        return type(
            "ResolvedRuntime",
            (),
            {
                "issuer": origin,
                "base_url": origin,
                "baseUrl": origin,
                "oauth": self.oauth,
            },
        )()


class Request:
    def __init__(self, url: str) -> None:
        self.url = url
        self.headers: Dict[str, str] = {}


class EventRecorder:
    def __init__(self) -> None:
        self.events: List[Dict[str, Any]] = []

    async def emit(self, event: Any) -> None:
        if hasattr(event, "model_dump"):
            self.events.append(event.model_dump(by_alias=True))
            return
        self.events.append(dict(event))


def build_google_fetcher() -> Any:
    async def fetcher(url: str, _init: Dict[str, Any]) -> MockResponse:
        if url != "https://oauth2.googleapis.com/token":
            raise AssertionError(f"unexpected url: {url}")
        return MockResponse(
            200,
            {
                "access_token": "google-access-token",
                "refresh_token": "google-refresh-token",
                "token_type": "Bearer",
                "scope": "openid email profile",
                "id_token": create_id_token(
                    {
                        "sub": "google-user-01",
                        "email": "ada@example.com",
                        "email_verified": True,
                        "name": "Ada Lovelace",
                    }
                ),
            },
        )

    return fetcher


def build_apple_fetcher(captured: Dict[str, str], *, missing_claims: bool = False) -> Any:
    async def fetcher(url: str, init: Dict[str, Any]) -> MockResponse:
        if url != "https://appleid.apple.com/auth/token":
            raise AssertionError(f"unexpected url: {url}")
        captured["body"] = init["body"]
        claims = {"sub": "apple-user-01", "email": "ada.apple@example.com", "name": "Ada Apple"}
        if missing_claims:
            claims = {"sub": "apple-user-02"}
        return MockResponse(
            200,
            {
                "access_token": "apple-access-token",
                "refresh_token": "apple-refresh-token",
                "token_type": "Bearer",
                "id_token": create_id_token(claims),
            },
        )

    return fetcher


def build_github_fetcher(*, fail_token_exchange: bool = False) -> Any:
    async def fetcher(url: str, _init: Dict[str, Any]) -> MockResponse:
        if url == "https://github.com/login/oauth/access_token":
            if fail_token_exchange:
                return MockResponse(
                    500,
                    {
                        "error": "server_error",
                        "error_description": "github-client-secret should stay hidden",
                    },
                )
            return MockResponse(
                200,
                {
                    "access_token": "github-access-token",
                    "token_type": "Bearer",
                    "scope": "read:user user:email",
                },
            )
        if url == "https://api.github.com/user":
            return MockResponse(200, {"id": 4242, "login": "ada", "name": "Ada Lovelace"})
        if url == "https://api.github.com/user/emails":
            return MockResponse(
                200,
                [{"email": "ada@example.com", "verified": True, "primary": True}],
            )
        raise AssertionError(f"unexpected url: {url}")

    return fetcher


def build_rate_limited_fetcher() -> Any:
    async def fetcher(url: str, _init: Dict[str, Any]) -> MockResponse:
        if url != "https://oauth2.googleapis.com/token":
            raise AssertionError(f"unexpected url: {url}")
        return MockResponse(
            429,
            {"error": "rate_limited", "error_description": "too many requests"},
        )

    return fetcher


@pytest.mark.asyncio
async def test_social_oauth_plugin_schema_and_routes() -> None:
    plugin = authfn_social_oauth_plugin()
    schema = plugin.schema(AuthFnConfig(database=object()))
    routes = plugin.routes(
        type(
            "Ctx",
            (),
            {"config": AuthFnConfig(database=object()), "namespace": "authfn", "base_path": "/auth"},
        )()
    )

    assert {table["modelName"] for table in schema} == {
        "oauth_states",
        "oauth_tokens",
        "oauth_accounts",
    }
    assert {route["path"] for route in routes} == {
        "/social/start",
        "/social/callback/:provider",
        "/social/disconnect/:provider",
    }


@pytest.mark.asyncio
async def test_google_start_callback_replay_and_redirect_hook() -> None:
    db = MockDatabaseAdapter()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))

    async def after_callback(_ctx: Any, payload: Dict[str, Any]) -> None:
        payload["redirectTo"] = "https://app.example.com/alternate-post-auth"

    config = AuthFnConfig(
        database=db,
        namespace="authfn",
        hooks=AuthFnHooks(afterOAuthCallback=after_callback),
    )
    service = SocialOAuthService(
        config,
        SocialOAuthPluginConfig(
            now=clock.now,
            fetcher=build_google_fetcher(),
            providers={
                "google": SocialProviderConfig(
                    client_id="google-client-id",
                    client_secret="google-client-secret",
                    allowlisted_return_to=[
                        "https://app.example.com/post-auth",
                        "https://app.example.com/alternate-post-auth",
                    ],
                )
            },
        ),
    )

    started = await service.start("google", return_to="https://app.example.com/post-auth")
    assert started["provider"] == "google"
    assert "https://accounts.google.com/o/oauth2/v2/auth" in started["redirectTo"]

    completed = await service.handle_callback(
        "google",
        code="abc123",
        state=started["stateId"],
    )
    assert completed["status"] == 303
    assert completed["redirectTo"] == "https://app.example.com/alternate-post-auth"

    state_row = db.storage["oauth_states"][0]
    rehydrated = await service.state_store.get(state_row["state_id"])
    assert rehydrated is not None
    assert rehydrated.code_verifier == state_row["code_verifier"]
    assert rehydrated.nonce == state_row["nonce"]

    linked = await db.find_one(
        model="oauth_accounts",
        where=[
            {"field": "provider", "operator": "eq", "value": "google"},
            {"field": "providerAccountId", "operator": "eq", "value": "google-user-01"},
        ],
        namespace="authfn",
    )
    assert linked is not None
    assert linked["email"] == "ada@example.com"
    assert len(db.storage["oauth_tokens"]) == 1
    assert "google-access-token" not in db.storage["oauth_tokens"][0]["encrypted_payload"]

    with pytest.raises(OAuthStateReplayedError):
        await service.handle_callback("google", code="abc123", state=started["stateId"])


@pytest.mark.asyncio
async def test_disallowed_redirect_and_unsupported_provider_raise_canonical_errors() -> None:
    service = SocialOAuthService(
        AuthFnConfig(database=MockDatabaseAdapter(), namespace="authfn"),
        SocialOAuthPluginConfig(
            fetcher=build_google_fetcher(),
            providers={
                "google": SocialProviderConfig(
                    client_id="google-client-id",
                    client_secret="google-client-secret",
                    allowlisted_return_to=["https://app.example.com/post-auth"],
                )
            },
        ),
    )

    with pytest.raises(RedirectUriDisallowedError):
        await service.start("google", return_to="https://evil.example.com/callback")

    with pytest.raises(OAuthProviderUnsupportedError):
        await service.start("discord", callback_mode="json")


@pytest.mark.asyncio
async def test_apple_runtime_secret_resolution_and_missing_claims() -> None:
    db = MockDatabaseAdapter()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))
    captured: Dict[str, str] = {}

    config = AuthFnConfig(
        database=db,
        namespace="authfn",
        runtime=RuntimeResolver(
            {
                "apple": {
                    "clientId": "apple-client-id",
                    "clientSecretResolver": lambda _ctx: {"clientSecret": "generated-apple-client-secret"},
                    "allowlistedReturnTo": ["https://app.example.com/apple-post-auth"],
                }
            }
        ),
    )
    service = SocialOAuthService(
        config,
        SocialOAuthPluginConfig(now=clock.now, fetcher=build_apple_fetcher(captured)),
    )

    started = await service.start("apple", return_to="https://app.example.com/apple-post-auth")
    completed = await service.handle_callback("apple", code="apple_code", state=started["stateId"])
    assert completed["status"] == 303
    assert completed["redirectTo"] == "https://app.example.com/apple-post-auth"
    assert "client_secret=generated-apple-client-secret" in captured["body"]

    bad_service = SocialOAuthService(
        config,
        SocialOAuthPluginConfig(now=clock.now, fetcher=build_apple_fetcher({}, missing_claims=True)),
    )
    bad_started = await bad_service.start("apple", return_to="https://app.example.com/apple-post-auth")
    with pytest.raises(OAuthCallbackInvalidError):
        await bad_service.handle_callback("apple", code="apple_code", state=bad_started["stateId"])


@pytest.mark.asyncio
async def test_github_links_verified_user_json_mode_and_sanitizes_failures() -> None:
    db = MockDatabaseAdapter()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))
    await db.create(
        model="users",
        data={
            "id": "user_1",
            "primaryEmail": "ada@example.com",
            "emailVerifiedAt": clock.now(),
            "createdAt": clock.now(),
            "updatedAt": clock.now(),
        },
        namespace="authfn",
    )

    service = SocialOAuthService(
        AuthFnConfig(database=db, namespace="authfn"),
        SocialOAuthPluginConfig(
            now=clock.now,
            fetcher=build_github_fetcher(),
            providers={
                "github": SocialProviderConfig(
                    client_id="github-client-id",
                    client_secret="github-client-secret",
                    link_by_verified_email=True,
                )
            },
        ),
    )

    started = await service.start("github", callback_mode="json")
    completed = await service.handle_callback("github", code="github_code", state=started["stateId"])
    assert completed["status"] == 200
    assert completed["body"]["data"] == {"linked": True, "provider": "github"}

    linked = await db.find_one(
        model="oauth_accounts",
        where=[
            {"field": "provider", "operator": "eq", "value": "github"},
            {"field": "providerAccountId", "operator": "eq", "value": "4242"},
        ],
        namespace="authfn",
    )
    assert linked is not None
    assert linked["userId"] == "user_1"

    failing = SocialOAuthService(
        AuthFnConfig(database=MockDatabaseAdapter(), namespace="authfn"),
        SocialOAuthPluginConfig(
            now=clock.now,
            fetcher=build_github_fetcher(fail_token_exchange=True),
            providers={
                "github": SocialProviderConfig(
                    client_id="github-client-id",
                    client_secret="github-client-secret",
                )
            },
        ),
    )
    failing_start = await failing.start("github", callback_mode="json")
    with pytest.raises(InternalError) as exc_info:
        await failing.handle_callback("github", code="github_code", state=failing_start["stateId"])

    assert "github-client-secret" not in str(exc_info.value)
    assert str(exc_info.value) == "OAuth token exchange failed"


@pytest.mark.asyncio
async def test_social_oauth_registers_region_and_emits_observability_events() -> None:
    db = MockDatabaseAdapter()
    clock = FixedClock(datetime(2026, 3, 22, 0, 0, 0))
    events = EventRecorder()
    region_plugin = authfn_multi_region_plugin(
        MultiRegionPluginConfig(
            regions=[
                MultiRegionRegionConfig(
                    region_id="eu-west-1",
                    authority="https://eu.account.example.com",
                    hosts=["eu.account.example.com"],
                )
            ]
        )
    )
    config = AuthFnConfig(
        database=db,
        namespace="authfn",
        runtime=RuntimeResolver(
            {
                "google": {
                    "clientId": "google-client-id",
                    "clientSecret": "google-client-secret",
                    "allowlistedReturnTo": ["https://app.example.com/post-auth"],
                }
            }
        ),
        plugins=[region_plugin],
        observability={"emit": events.emit},
    )
    service = SocialOAuthService(
        config,
        SocialOAuthPluginConfig(now=clock.now, fetcher=build_google_fetcher()),
    )

    started = await service.start(
        "google",
        return_to="https://app.example.com/post-auth",
        request=Request("https://eu.account.example.com/auth/social/start"),
    )
    await service.handle_callback(
        "google",
        code="abc123",
        state=started["stateId"],
        request=Request("https://eu.account.example.com/auth/social/callback/google"),
    )

    assert len(db.storage["region_profiles"]) == 1
    assert db.storage["region_profiles"][0]["regionId"] == "eu-west-1"
    assert {event["type"] for event in events.events} >= {
        "authfn.oauth.started",
        "authfn.oauth.completed",
    }


@pytest.mark.asyncio
async def test_social_oauth_maps_provider_rate_limits_to_canonical_error() -> None:
    service = SocialOAuthService(
        AuthFnConfig(database=MockDatabaseAdapter(), namespace="authfn"),
        SocialOAuthPluginConfig(
            fetcher=build_rate_limited_fetcher(),
            providers={
                "google": SocialProviderConfig(
                    client_id="google-client-id",
                    client_secret="google-client-secret",
                )
            },
        ),
    )

    started = await service.start("google", callback_mode="json")
    with pytest.raises(RateLimitedError):
        await service.handle_callback("google", code="abc123", state=started["stateId"])
