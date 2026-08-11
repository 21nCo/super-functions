"""FastAPI auth-derived identity tests for PlugFn."""

from datetime import datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from plugfn.adapters.fastapi import mount_plugfn


class AsyncAuthProvider:
    def __init__(self, principal):
        self.principal = principal

    async def authenticate(self, request):
        return self.principal


class MockConnections:
    def __init__(self):
        self.list_calls = []
        self.auth_url_calls = []
        self.disconnect_calls = []
        self.callback_calls = []

    async def list(self, user_id, provider=None):
        self.list_calls.append({"user_id": user_id, "provider": provider})
        return [
            SimpleNamespace(
                id="conn_1",
                provider="github",
                name="Primary",
                status="active",
                connected_at=datetime(2026, 3, 27, 0, 0, 0),
            )
        ]

    async def get_auth_url(self, provider, user_id, redirect_uri, scopes=None, connection_name=None):
        self.auth_url_calls.append(
            {
                "provider": provider,
                "user_id": user_id,
                "redirect_uri": redirect_uri,
                "scopes": scopes,
                "connection_name": connection_name,
            }
        )
        return "https://github.com/login/oauth/authorize?state=test"

    async def disconnect(self, connection_id, user_id):
        self.disconnect_calls.append({"connection_id": connection_id, "user_id": user_id})

    async def handle_callback(self, provider, code, state):
        self.callback_calls.append({"provider": provider, "code": code, "state": state})
        return SimpleNamespace(id="conn_1", provider=provider or "github", status="active")


def create_app(principal):
    app = FastAPI()
    connections = MockConnections()
    providers = [
        SimpleNamespace(
            name="github",
            display_name="GitHub",
            description="GitHub integration",
            auth_type="oauth2",
            version="1.0.0",
        )
    ]
    plug = SimpleNamespace(
        config=SimpleNamespace(
            auth=AsyncAuthProvider(principal),
            integrations={"github": {"webhook_secret": "whsec_github"}},
            base_url="https://app.example.com",
        ),
        connections=connections,
        providers=SimpleNamespace(list=lambda: providers),
        _connection_manager=SimpleNamespace(resolve_webhook_secret=lambda provider: "whsec_github"),
        _webhook_handler=SimpleNamespace(handle_webhook=None),
    )
    mount_plugfn(app, plug)
    return app, connections


def test_fastapi_connections_use_authenticated_principal():
    app, connections = create_app({"userId": "user_from_auth"})
    client = TestClient(app)

    response = client.get("/api/plugfn/connections?provider=github")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["data"]["userId"] == "user_from_auth"
    assert connections.list_calls == [{"user_id": "user_from_auth", "provider": "github"}]


def test_fastapi_exposes_canonical_route_inventory():
    app, _connections = create_app({"userId": "user_from_auth"})

    routes = sorted(
        {
            f"{method} {route.path}"
            for route in app.router.routes
            for method in route.methods or []
            if method in {"GET", "POST"}
        }
    )

    assert "GET /api/plugfn/callback" in routes
    assert "GET /api/plugfn/connections" in routes
    assert "GET /api/plugfn/providers" in routes
    assert "POST /api/plugfn/connections/auth" in routes
    assert "POST /api/plugfn/connections/disconnect" in routes
    assert "POST /api/plugfn/webhooks/{provider}/{event}" in routes


def test_fastapi_canonical_callback_resolves_provider_from_state():
    app, connections = create_app({"userId": "user_from_auth"})
    client = TestClient(app)

    response = client.get("/api/plugfn/callback?code=oauth-code&state=oauth-state")

    assert response.status_code == 200
    assert response.json()["data"]["connection"]["provider"] == "github"
    assert connections.callback_calls == [
        {"provider": None, "code": "oauth-code", "state": "oauth-state"}
    ]


def test_fastapi_rejects_query_user_spoofing():
    app, connections = create_app({"userId": "user_from_auth"})
    client = TestClient(app)

    response = client.get("/api/plugfn/connections?provider=github&user_id=spoofed_user")

    assert response.status_code == 403
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "TENANT_ACCESS_DENIED"
    assert connections.list_calls == []


def test_fastapi_requires_auth_for_non_webhook_routes():
    app, connections = create_app(None)
    client = TestClient(app)

    response = client.get("/api/plugfn/connections")

    assert response.status_code == 401
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "PLUGFN_AUTH_REQUIRED"
    assert connections.list_calls == []


def test_fastapi_connections_auth_uses_authenticated_user_for_oauth_start():
    app, connections = create_app({"userId": "user_from_auth"})
    client = TestClient(app)

    response = client.post(
        "/api/plugfn/connections/auth",
        json={
            "provider": "github",
            "redirect_uri": "https://app.example.com/callback",
            "user_id": "user_from_auth",
            "scopes": ["repo"],
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert connections.auth_url_calls == [
        {
            "provider": "github",
            "user_id": "user_from_auth",
            "redirect_uri": "https://app.example.com/callback",
            "scopes": ["repo"],
            "connection_name": None,
        }
    ]
