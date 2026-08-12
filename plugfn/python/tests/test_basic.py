"""Basic tests for PlugFn Python SDK."""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import pytest

from plugfn import AuthProvider, DatabaseAdapter, PlugFn
from plugfn.auth import MemoryTokenStore
from plugfn.providers import github_provider, slack_provider


class MockAdapter(DatabaseAdapter):
    """Mock database adapter for testing."""

    def __init__(self):
        self.connections: Dict[str, Any] = {}
        self.workflows: Dict[str, Any] = {}

    async def createConnection(self, connection: Dict[str, Any]) -> None:
        self.connections[connection["id"]] = connection

    async def getConnection(self, id: str) -> Optional[Dict[str, Any]]:
        return self.connections.get(id)

    async def listConnections(
        self, userId: str, provider: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return [c for c in self.connections.values() if c["user_id"] == userId]

    async def updateConnection(self, id: str, updates: Dict[str, Any]) -> None:
        if id in self.connections:
            self.connections[id].update(updates)

    async def deleteConnection(self, id: str) -> None:
        if id in self.connections:
            del self.connections[id]

    async def createWebhook(self, webhook: Dict[str, Any]) -> None:
        pass

    async def getWebhook(self, id: str) -> Optional[Dict[str, Any]]:
        return None

    async def listWebhooks(self, provider: Optional[str] = None) -> List[Dict[str, Any]]:
        return []

    async def updateWebhook(self, id: str, updates: Dict[str, Any]) -> None:
        pass

    async def deleteWebhook(self, id: str) -> None:
        pass

    async def createWorkflow(self, workflow: Dict[str, Any]) -> None:
        self.workflows[workflow["id"]] = workflow

    async def getWorkflow(self, id: str) -> Optional[Dict[str, Any]]:
        return self.workflows.get(id)

    async def listWorkflows(
        self, userId: Optional[str] = None, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return list(self.workflows.values())

    async def updateWorkflow(self, id: str, updates: Dict[str, Any]) -> None:
        pass

    async def deleteWorkflow(self, id: str) -> None:
        pass

    async def createWorkflowExecution(self, execution: Dict[str, Any]) -> None:
        pass

    async def updateWorkflowExecution(self, id: str, updates: Dict[str, Any]) -> None:
        pass

    async def listWorkflowExecutions(
        self, workflowId: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return []

    async def createActionLog(self, log: Dict[str, Any]) -> None:
        pass

    async def listActionLogs(
        self, filters: Dict[str, Any], limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return []


class MockAuthProvider(AuthProvider):
    """Mock auth provider for testing."""

    async def getUserId(self, request: Any) -> Optional[str]:
        return "test-user"

    async def requireAuth(self, request: Any) -> str:
        return "test-user"


@pytest.fixture
def plug():
    """Create a PlugFn instance for testing."""
    instance = PlugFn(
        database=MockAdapter(),
        auth=MockAuthProvider(),
        base_url="https://test.com",
        encryption_key="test-key-12345678901234567890!!",
        integrations={
            "github": {
                "client_id": "test-client-id",
                "client_secret": "test-client-secret",
            },
        },
    )

    # Register providers
    instance.providers.register(github_provider)
    instance.providers.register(slack_provider)

    return instance


def test_initialization(plug):
    """Test PlugFn initialization."""
    assert plug is not None
    assert plug.connections is not None
    assert plug.providers is not None
    assert plug.workflows is not None
    assert plug.webhooks is not None


def test_provider_registration(plug):
    """Test provider registration."""
    providers = plug.providers.list()
    assert len(providers) >= 2

    github = plug.providers.get("github")
    assert github is not None
    assert github.name == "github"
    assert github.display_name == "GitHub"

    slack = plug.providers.get("slack")
    assert slack is not None
    assert slack.name == "slack"


@pytest.mark.asyncio
async def test_get_auth_url(plug):
    """Test OAuth authorization URL generation."""
    url = await plug.connections.get_auth_url(
        provider="github",
        user_id="test-user",
        redirect_uri="https://test.com/callback",
    )

    parsed_url = urlparse(url)
    assert parsed_url.scheme == "https"
    assert parsed_url.hostname == "github.com"
    assert "client_id" in parse_qs(parsed_url.query)


@pytest.mark.asyncio
async def test_canonical_callback_resolves_provider_from_stored_state(plug):
    url = await plug.connections.get_auth_url(
        provider="github",
        user_id="test-user",
        redirect_uri="https://test.com/callback",
    )
    state = parse_qs(urlparse(url).query)["state"][0]

    async def exchange_code_for_token(**_kwargs):
        return {"access_token": "token", "token_type": "bearer"}

    plug._connection_manager.oauth_handler.exchange_code_for_token = exchange_code_for_token
    plug._connection_manager.token_storage.encrypt = lambda value: f"encrypted:{value}"

    connection = await plug.connections.handle_callback(
        provider=None,
        code="oauth-code",
        state=state,
    )

    assert connection.provider == "github"


@pytest.mark.asyncio
async def test_list_connections(plug):
    """Test listing connections."""
    connections = await plug.connections.list(user_id="test-user")
    assert isinstance(connections, list)


@pytest.mark.asyncio
async def test_explicit_connection_must_match_requested_provider(plug):
    now = datetime.now()
    await plug.config.database.createConnection(
        {
            "id": "conn-slack",
            "user_id": "test-user",
            "provider": "slack",
            "status": "active",
            "credentials": "encrypted",
            "connected_at": now,
            "created_at": now,
            "updated_at": now,
        }
    )

    with pytest.raises(ValueError, match="provider does not match"):
        await plug.github.issues.create(
            user_id="test-user",
            params={"owner": "org", "repo": "repo", "title": "Bug"},
            connection_id="conn-slack",
        )


@pytest.mark.asyncio
async def test_refresh_preserves_an_unrotated_refresh_token(plug):
    now = datetime.now()
    await plug.config.database.createConnection(
        {
            "id": "conn-github-refresh",
            "user_id": "test-user",
            "provider": "github",
            "status": "active",
            "credentials": "encrypted",
            "connected_at": now,
            "created_at": now,
            "updated_at": now,
        }
    )
    plug._connection_manager.token_storage.decrypt = lambda _value: json.dumps(
        {"access_token": "old", "refresh_token": "keep-me"}
    )
    plug._connection_manager.token_storage.encrypt = lambda value: value

    async def refresh_token(**_kwargs):
        return {"access_token": "new", "expires_in": 3600}

    plug._connection_manager.oauth_handler.refresh_token = refresh_token

    refreshed = await plug.connections.refresh("conn-github-refresh")
    credentials = json.loads(refreshed.credentials)
    assert credentials["access_token"] == "new"
    assert credentials["refresh_token"] == "keep-me"


@pytest.mark.asyncio
async def test_oauth_state_store_can_be_shared_across_instances():
    database = MockAdapter()
    auth = MockAuthProvider()
    state_store = MemoryTokenStore()
    kwargs = {
        "database": database,
        "auth": auth,
        "base_url": "https://test.com",
        "encryption_key": "test-key-12345678901234567890!!",
        "integrations": {
            "github": {
                "client_id": "test-client-id",
                "client_secret": "test-client-secret",
            }
        },
        "oauth_state_store": state_store,
    }
    first = PlugFn(**kwargs)
    second = PlugFn(**kwargs)
    first.providers.register(github_provider)
    second.providers.register(github_provider)
    url = await first.connections.get_auth_url(
        provider="github",
        user_id="test-user",
        redirect_uri="https://test.com/callback",
    )
    state = parse_qs(urlparse(url).query)["state"][0]

    async def exchange_code_for_token(**_kwargs):
        return {"access_token": "token", "token_type": "bearer"}

    second._connection_manager.oauth_handler.exchange_code_for_token = (
        exchange_code_for_token
    )
    second._connection_manager.token_storage.encrypt = lambda value: f"encrypted:{value}"

    connection = await second.connections.handle_callback(
        provider=None,
        code="oauth-code",
        state=state,
    )
    assert connection.provider == "github"


@pytest.mark.asyncio
async def test_webhook_handler_registration(plug):
    """Test webhook handler registration."""
    handler_called = False

    async def test_handler(event):
        nonlocal handler_called
        handler_called = True
        return {"success": True}

    plug.webhooks.on("github", "issues.opened", test_handler)

    # Handler should be registered
    assert "github" in plug._webhook_handler._handlers
    assert "issues.opened" in plug._webhook_handler._handlers["github"]


def test_webhook_handler_decorator_registration(plug):
    """Documented decorator syntax registers and preserves the callback."""

    @plug.webhooks.on("github", "issues.closed")
    async def handler(event):
        return {"event": event}

    assert handler in plug._webhook_handler._handlers["github"]["issues.closed"]


@pytest.mark.asyncio
async def test_metrics(plug):
    """Test metrics retrieval."""
    metrics = await plug.get_metrics()

    assert isinstance(metrics, dict)
    assert "total_requests" in metrics
    assert "success_rate" in metrics


def test_provider_proxy_access(plug):
    """Test dynamic provider access."""
    # Should be able to access provider as attribute
    assert hasattr(plug, "github")
    github = plug.github

    # Should have action methods
    assert hasattr(github, "issues")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
