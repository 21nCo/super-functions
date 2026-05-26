"""FastAPI integration example for PlugFn."""

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Depends
from fastapi.responses import RedirectResponse

from plugfn import PlugFn, AuthProvider, DatabaseAdapter


# Use the same adapters from basic_usage.py
class MemoryAdapter(DatabaseAdapter):
    """Simple in-memory database adapter."""

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
        return list(self.workflows.values())

    async def updateWorkflow(self, id: str, updates: Dict[str, Any]) -> None:
        if id in self.workflows:
            self.workflows[id].update(updates)

    async def deleteWorkflow(self, id: str) -> None:
        if id in self.workflows:
            del self.workflows[id]

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


class SimpleAuthProvider(AuthProvider):
    """Simple auth provider."""

    async def getUserId(self, request: Any) -> Optional[str]:
        return "user-123"

    async def requireAuth(self, request: Any) -> str:
        return "user-123"


# Initialize FastAPI app
app = FastAPI(title="PlugFn FastAPI Example")

# Initialize PlugFn
plug = PlugFn(
    database=MemoryAdapter(),
    auth=SimpleAuthProvider(),
    base_url=os.getenv("BASE_URL", "http://localhost:8000"),
    encryption_key="your-32-character-key-here!!!!!!",
    integrations={
        "github": {
            "client_id": os.getenv("GITHUB_CLIENT_ID", "your-client-id"),
            "client_secret": os.getenv("GITHUB_CLIENT_SECRET", "your-secret"),
        },
    },
)

# Register providers
from plugfn.providers import github_provider, slack_provider

plug.providers.register(github_provider)
plug.providers.register(slack_provider)

# Mount PlugFn routes
try:
    from plugfn.adapters.fastapi import mount_plugfn_fastapi

    mount_plugfn_fastapi(app, plug, prefix="/api/plugfn")
except ImportError:
    print("FastAPI adapter not available. Install with: pip install plugfn[fastapi]")


# Custom routes
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "PlugFn FastAPI Example",
        "providers": [p.name for p in plug.providers.list()],
    }


@app.get("/connect/{provider}")
async def connect_provider(provider: str):
    """Initiate OAuth connection to a provider."""
    auth_url = await plug.connections.get_auth_url(
        provider=provider,
        user_id="user-123",
        redirect_uri=f"{os.getenv('BASE_URL', 'http://localhost:8000')}/api/plugfn/auth/{provider}/callback",
    )
    return RedirectResponse(url=auth_url)


@app.post("/github/create-issue")
async def create_github_issue(
    owner: str,
    repo: str,
    title: str,
    body: str = "",
):
    """Create a GitHub issue using PlugFn."""
    try:
        # This requires an active GitHub connection
        issue = await plug.github.issues.create(
            user_id="user-123",
            params={
                "owner": owner,
                "repo": repo,
                "title": title,
                "body": body,
            },
        )

        return {
            "success": True,
            "issue": {
                "number": issue.get("number"),
                "url": issue.get("html_url"),
            },
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# Register webhook handlers
@plug.webhooks.on("github", "issues.opened")
async def on_github_issue_opened(event):
    """Handle GitHub issue opened webhook."""
    print(f"New GitHub issue: {event.get('issue', {}).get('title')}")
    
    # Could post to Slack, create Linear issue, etc.
    return {"processed": True}


if __name__ == "__main__":
    import uvicorn

    print("\n" + "=" * 60)
    print("PlugFn FastAPI Example")
    print("=" * 60)
    print("\nEndpoints:")
    print("  GET  /                           - Root")
    print("  GET  /connect/{provider}         - Connect to provider")
    print("  POST /github/create-issue        - Create GitHub issue")
    print("  GET  /api/plugfn/providers       - List providers")
    print("  GET  /api/plugfn/connections     - List connections")
    print("\nStarting server on http://localhost:8000")
    print("=" * 60 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=8000)
