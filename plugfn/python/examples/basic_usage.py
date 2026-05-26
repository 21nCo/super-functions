"""Basic usage example for PlugFn Python SDK."""

import asyncio
import os
from typing import Any, Dict, List, Optional

from plugfn import PlugFn, AuthProvider, DatabaseAdapter, Connection


# Example database adapter implementation
class MemoryAdapter(DatabaseAdapter):
    """Simple in-memory database adapter for testing."""

    def __init__(self):
        self.connections: Dict[str, Any] = {}
        self.workflows: Dict[str, Any] = {}
        self.workflow_executions: Dict[str, List[Any]] = {}

    async def createConnection(self, connection: Dict[str, Any]) -> None:
        self.connections[connection["id"]] = connection

    async def getConnection(self, id: str) -> Optional[Dict[str, Any]]:
        return self.connections.get(id)

    async def listConnections(
        self, userId: str, provider: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        connections = [
            c for c in self.connections.values() if c["user_id"] == userId
        ]
        if provider:
            connections = [c for c in connections if c["provider"] == provider]
        return connections

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
        workflows = list(self.workflows.values())
        if userId:
            workflows = [w for w in workflows if w["user_id"] == userId]
        if status:
            workflows = [w for w in workflows if w["status"] == status]
        return workflows

    async def updateWorkflow(self, id: str, updates: Dict[str, Any]) -> None:
        if id in self.workflows:
            self.workflows[id].update(updates)

    async def deleteWorkflow(self, id: str) -> None:
        if id in self.workflows:
            del self.workflows[id]

    async def createWorkflowExecution(self, execution: Dict[str, Any]) -> None:
        workflow_id = execution["workflow_id"]
        if workflow_id not in self.workflow_executions:
            self.workflow_executions[workflow_id] = []
        self.workflow_executions[workflow_id].append(execution)

    async def updateWorkflowExecution(self, id: str, updates: Dict[str, Any]) -> None:
        pass

    async def listWorkflowExecutions(
        self, workflowId: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        executions = self.workflow_executions.get(workflowId, [])
        if limit:
            executions = executions[:limit]
        return executions

    async def createActionLog(self, log: Dict[str, Any]) -> None:
        pass

    async def listActionLogs(
        self, filters: Dict[str, Any], limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return []


# Example auth provider implementation
class SimpleAuthProvider(AuthProvider):
    """Simple auth provider for testing."""

    async def getUserId(self, request: Any) -> Optional[str]:
        # In a real app, extract user ID from JWT or session
        return "user-123"

    async def requireAuth(self, request: Any) -> str:
        user_id = await self.getUserId(request)
        if not user_id:
            raise Exception("Unauthorized")
        return user_id


async def main():
    """Example usage of PlugFn."""
    
    # Initialize PlugFn
    plug = PlugFn(
        database=MemoryAdapter(),
        auth=SimpleAuthProvider(),
        base_url="https://myapp.com",
        encryption_key="your-32-character-key-here!!!!!!",
        integrations={
            "github": {
                "client_id": os.getenv("GITHUB_CLIENT_ID", "your-github-client-id"),
                "client_secret": os.getenv("GITHUB_CLIENT_SECRET", "your-github-secret"),
            },
            "slack": {
                "client_id": os.getenv("SLACK_CLIENT_ID", "your-slack-client-id"),
                "client_secret": os.getenv("SLACK_CLIENT_SECRET", "your-slack-secret"),
            },
        },
    )

    # Register providers
    from plugfn.providers import github_provider, slack_provider

    plug.providers.register(github_provider)
    plug.providers.register(slack_provider)

    print("✓ PlugFn initialized")
    print(f"✓ Registered {len(plug.providers.list())} providers")

    # List available providers
    providers = plug.providers.list()
    print("\nAvailable providers:")
    for provider in providers:
        print(f"  - {provider.display_name} ({provider.name})")

    # Example 1: Get OAuth authorization URL
    print("\n--- Example 1: OAuth Authorization ---")
    try:
        auth_url = await plug.connections.get_auth_url(
            provider="github",
            user_id="user-123",
            redirect_uri="https://myapp.com/auth/callback",
            scopes=["repo", "user"],
        )
        print(f"Authorization URL: {auth_url[:50]}...")
    except Exception as e:
        print(f"Error: {e}")

    # Example 2: Simulate OAuth callback (in real app, this comes from GitHub)
    # Note: This won't work without a real OAuth flow
    print("\n--- Example 2: OAuth Callback (simulated) ---")
    print("In a real app, GitHub would redirect to your callback URL with code and state")

    # Example 3: List connections
    print("\n--- Example 3: List Connections ---")
    connections = await plug.connections.list(user_id="user-123")
    print(f"Found {len(connections)} connections")

    # Example 4: Register webhook handler
    print("\n--- Example 4: Webhook Handlers ---")

    @plug.webhooks.on("github", "issues.opened")
    async def handle_github_issue(event):
        """Handle GitHub issue opened event."""
        print(f"GitHub issue opened: {event.get('issue', {}).get('title')}")
        return {"processed": True}

    print("✓ Registered webhook handler for github.issues.opened")

    # Example 5: Execute action (requires active connection)
    print("\n--- Example 5: Execute Action ---")
    print("Note: This requires an active GitHub connection")
    print("To create a connection, visit the auth URL from Example 1")

    # Example 6: Batch actions
    print("\n--- Example 6: Batch Actions ---")
    print("Batch execution allows running multiple actions in parallel")

    # Example 7: Get metrics
    print("\n--- Example 7: Metrics ---")
    metrics = await plug.get_metrics()
    print(f"Total requests: {metrics.get('total_requests', 0)}")
    print(f"Success rate: {metrics.get('success_rate', 0) * 100:.1f}%")

    print("\n✓ Examples completed!")


if __name__ == "__main__":
    asyncio.run(main())
