"""Basic tests for PlugFn Python SDK."""

import pytest
from typing import Any, Dict, List, Optional

from plugfn import PlugFn, AuthProvider, DatabaseAdapter
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

    assert url is not None
    assert "github.com" in url
    assert "client_id" in url


@pytest.mark.asyncio
async def test_list_connections(plug):
    """Test listing connections."""
    connections = await plug.connections.list(user_id="test-user")
    assert isinstance(connections, list)


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
