# PlugFn Python SDK - Quick Start

Get started with PlugFn in 5 minutes.

## Installation

```bash
pip install plugfn
```

For FastAPI support:
```bash
pip install plugfn[fastapi]
```

For Flask support:
```bash
pip install plugfn[flask]
```

For development:
```bash
pip install plugfn[dev]
```

## Basic Setup

### 1. Create Database Adapter

Implement the `DatabaseAdapter` protocol for your database:

```python
from plugfn import DatabaseAdapter

class MyDatabaseAdapter(DatabaseAdapter):
    # Implement required methods
    # See examples/basic_usage.py for a simple in-memory adapter
    pass
```

### 2. Create Auth Provider

Implement the `AuthProvider` protocol:

```python
from plugfn import AuthProvider

class MyAuthProvider(AuthProvider):
    async def getUserId(self, request) -> str:
        # Extract user ID from your auth system (JWT, session, etc.)
        return "user-123"
    
    async def requireAuth(self, request) -> str:
        user_id = await self.getUserId(request)
        if not user_id:
            raise Exception("Unauthorized")
        return user_id
```

### 3. Initialize PlugFn

```python
from plugfn import PlugFn
from plugfn.providers import github_provider, slack_provider

plug = PlugFn(
    database=MyDatabaseAdapter(),
    auth=MyAuthProvider(),
    base_url="https://myapp.com",
    encryption_key="your-32-character-encryption-key!",
    integrations={
        "github": {
            "client_id": "your-github-client-id",
            "client_secret": "your-github-client-secret",
        },
        "slack": {
            "client_id": "your-slack-client-id",
            "client_secret": "your-slack-client-secret",
        },
    }
)

# Register providers
plug.providers.register(github_provider)
plug.providers.register(slack_provider)
```

## OAuth Flow

### 1. Generate Authorization URL

```python
# When user wants to connect GitHub
auth_url = await plug.connections.get_auth_url(
    provider="github",
    user_id="user-123",
    redirect_uri="https://myapp.com/auth/callback",
    scopes=["repo", "user"],
)

# Redirect user to auth_url
```

### 2. Handle OAuth Callback

```python
# In your callback endpoint
connection = await plug.connections.handle_callback(
    provider="github",
    code=request.query_params["code"],
    state=request.query_params["state"],
)

# Connection is now created and ready to use
print(f"Connected! Connection ID: {connection.id}")
```

## Execute Actions

```python
# Create a GitHub issue
issue = await plug.github.issues.create(
    user_id="user-123",
    params={
        "owner": "myorg",
        "repo": "myrepo",
        "title": "Bug: Something broke",
        "body": "Here's a detailed description...",
        "labels": ["bug", "urgent"],
    }
)

print(f"Created issue #{issue['number']}: {issue['html_url']}")
```

## Handle Webhooks

```python
# Register a webhook handler
@plug.webhooks.on("github", "issues.opened")
async def handle_new_issue(event):
    """Called when a GitHub issue is opened."""
    issue = event["issue"]
    
    # Post to Slack
    await plug.slack.chat.postMessage(
        user_id="system",
        params={
            "channel": "#engineering",
            "text": f"New issue: {issue['title']}",
        }
    )
    
    return {"processed": True}
```

## FastAPI Integration

```python
from fastapi import FastAPI
from plugfn.adapters.fastapi import mount_plugfn_fastapi

app = FastAPI()

# Mount PlugFn routes
mount_plugfn_fastapi(app, plug, prefix="/api/plugfn")

# Your routes
@app.get("/")
def root():
    return {"message": "Hello World"}

# Available endpoints:
# GET  /api/plugfn/providers
# GET  /api/plugfn/connections
# GET  /api/plugfn/auth/{provider}
# GET  /api/plugfn/auth/{provider}/callback
# POST /api/plugfn/webhooks/{provider}/{event}
```

## Flask Integration

```python
from flask import Flask
from plugfn.adapters.flask import mount_plugfn_flask

app = Flask(__name__)

# Mount PlugFn routes
mount_plugfn_flask(app, plug, prefix="/api/plugfn")

# Your routes
@app.route("/")
def root():
    return {"message": "Hello World"}
```

## List Connections

```python
# Get all connections for a user
connections = await plug.connections.list(user_id="user-123")

for conn in connections:
    print(f"{conn.provider}: {conn.status}")
```

## Batch Actions

```python
# Execute multiple actions in parallel
results = await plug.batch([
    {
        "provider": "github",
        "action": "issues.create",
        "user_id": "user-123",
        "params": {"owner": "org", "repo": "repo1", "title": "Issue 1"},
    },
    {
        "provider": "github",
        "action": "issues.create",
        "user_id": "user-123",
        "params": {"owner": "org", "repo": "repo2", "title": "Issue 2"},
    },
])

for result in results:
    if result["success"]:
        print(f"Success: {result['data']}")
    else:
        print(f"Error: {result['error']}")
```

## Get Metrics

```python
metrics = await plug.get_metrics()

print(f"Total requests: {metrics['total_requests']}")
print(f"Success rate: {metrics['success_rate'] * 100:.1f}%")
print(f"Avg response time: {metrics['avg_response_time']}ms")
```

## Next Steps

- **Custom Providers**: See [CREATING_PROVIDERS.md](./CREATING_PROVIDERS.md)
- **Implementation Details**: See [../IMPLEMENTATION.md](../IMPLEMENTATION.md)
- **Examples**: Check out the [examples](../examples/) directory
- **Tests**: Run `pytest` to see more usage examples

## Common Patterns

### Check Connection Status

```python
connections = await plug.connections.list(
    user_id="user-123",
    provider="github"
)

if not connections:
    # Show "Connect GitHub" button
    auth_url = await plug.connections.get_auth_url(...)
else:
    # User is connected, can use GitHub actions
    connection = connections[0]
    if connection.status == "expired":
        # Refresh the connection
        await plug.connections.refresh(connection.id)
```

### Error Handling

```python
try:
    issue = await plug.github.issues.create(...)
except Exception as e:
    if "No active connection" in str(e):
        # User needs to connect their GitHub account
        pass
    elif "rate limit" in str(e).lower():
        # Rate limit exceeded
        pass
    else:
        # Other error
        raise
```

### Webhook Verification

Webhooks are automatically verified using the provider's signature verification:

```python
# In your webhook endpoint
await plug.webhooks.handle(
    provider="github",
    event="issues.opened",
    payload=request.json(),
    headers=dict(request.headers),
    secret=os.getenv("GITHUB_WEBHOOK_SECRET"),  # Optional
)
```

## Environment Variables

Recommended environment variables:

```bash
# OAuth credentials
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_secret

# Encryption
PLUGFN_ENCRYPTION_KEY=your-32-character-key-here!!!!

# Base URL
BASE_URL=https://myapp.com

# Webhook secrets
GITHUB_WEBHOOK_SECRET=your_webhook_secret
SLACK_WEBHOOK_SECRET=your_slack_secret
```

## Troubleshooting

### "No active connection found"

Make sure the user has connected their account via OAuth:

```python
connections = await plug.connections.list(user_id=user_id, provider="github")
if not connections:
    # User needs to connect
    pass
```

### "Invalid encryption key"

The encryption key must be exactly 32 characters or will be hashed to 32 bytes.

### "Provider not found"

Make sure to register the provider before using it:

```python
plug.providers.register(github_provider)
```

### Import errors

Make sure all dependencies are installed:

```bash
pip install plugfn[all]
```

## Support

- **Documentation**: https://docs.superfunctions.dev/plugfn
- **GitHub Issues**: https://github.com/superfunctions/superfunctions/issues
- **Examples**: See the [examples](../examples/) directory
