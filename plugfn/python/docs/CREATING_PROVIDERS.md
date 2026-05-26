# Creating Custom Providers

This guide explains how to create custom providers for PlugFn Python SDK.

## Overview

A provider is a collection of:
1. **Metadata** - Name, description, version, etc.
2. **Authentication Config** - OAuth URLs, API key settings, etc.
3. **Actions** - API operations that can be executed
4. **Triggers** (optional) - Webhook events that can be subscribed to

## Step-by-Step Guide

### 1. Define Provider Metadata

```python
from plugfn.types import Provider, AuthType

my_provider = Provider(
    name="myservice",                    # Unique identifier
    display_name="My Service",           # Display name
    version="1.0.0",                     # Provider version
    description="Integration with My Service API",
    base_url="https://api.myservice.com", # API base URL
    auth_type=AuthType.OAUTH2,          # Auth type
    icon_url="https://myservice.com/icon.png",  # Optional icon
    rate_limit={                         # Optional rate limiting
        "requests": 100,
        "window": 60000  # milliseconds
    }
)
```

### 2. Add Authentication Configuration

#### OAuth 2.0

```python
my_provider.auth_config = {
    "authorization_url": "https://myservice.com/oauth/authorize",
    "token_url": "https://myservice.com/oauth/token",
    "scopes": ["read", "write"],
    "scope_separator": " ",  # Space or comma
}
```

#### API Key

```python
my_provider = Provider(
    name="myservice",
    # ... other config ...
    auth_type=AuthType.API_KEY,
)

my_provider.auth_config = {
    "header_name": "X-API-Key",
    "prefix": "",  # Optional prefix like "Bearer"
}
```

#### Basic Auth

```python
my_provider = Provider(
    name="myservice",
    # ... other config ...
    auth_type=AuthType.BASIC,
)

my_provider.auth_config = {
    "username_field": "username",
    "password_field": "password",
}
```

### 3. Define Action Parameters

Use Pydantic models for type-safe parameters:

```python
from pydantic import BaseModel, Field

class CreateTaskParams(BaseModel):
    """Parameters for creating a task."""
    
    title: str = Field(..., description="Task title")
    description: str = Field(default="", description="Task description")
    assignee: str | None = Field(None, description="User to assign to")
    due_date: str | None = Field(None, description="Due date (ISO 8601)")
    priority: int = Field(default=0, description="Priority (0-5)")
```

### 4. Implement Actions

Create action classes that inherit from a base action:

```python
from typing import Any, Dict

class MyServiceAction:
    """Base action class."""
    
    def __init__(self, name: str, display_name: str, description: str):
        self.name = name
        self.display_name = display_name
        self.description = description
    
    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Execute the action."""
        raise NotImplementedError


class CreateTaskAction(MyServiceAction):
    """Create a task in My Service."""
    
    def __init__(self):
        super().__init__(
            name="tasks.create",
            display_name="Create Task",
            description="Create a new task in My Service",
        )
    
    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Create a task."""
        # Validate parameters
        validated = CreateTaskParams(**params)
        
        # Make API request using context.http
        response = await context.http.post(
            "/tasks",
            json={
                "title": validated.title,
                "description": validated.description,
                "assignee": validated.assignee,
                "due_date": validated.due_date,
                "priority": validated.priority,
            }
        )
        
        return response
```

### 5. Register Actions

Add actions to the provider:

```python
my_provider.actions = {
    "tasks.create": CreateTaskAction(),
    "tasks.list": ListTasksAction(),
    "tasks.get": GetTaskAction(),
    "tasks.update": UpdateTaskAction(),
    "tasks.delete": DeleteTaskAction(),
}
```

### 6. Define Triggers (Optional)

For webhook support:

```python
my_provider.triggers = {
    "task.created": {
        "name": "task.created",
        "display_name": "Task Created",
        "description": "Triggered when a task is created",
    },
    "task.completed": {
        "name": "task.completed",
        "display_name": "Task Completed",
        "description": "Triggered when a task is marked as completed",
    },
}
```

## Complete Example

Here's a complete provider example:

```python
"""My Service provider implementation."""

from typing import Any, Dict
from pydantic import BaseModel, Field

from plugfn.types import Provider, AuthType


# Parameter models
class CreateTaskParams(BaseModel):
    title: str = Field(..., description="Task title")
    description: str = Field(default="", description="Task description")


class TaskListParams(BaseModel):
    status: str | None = Field(None, description="Filter by status")
    limit: int = Field(default=50, description="Number of tasks to return")


# Action implementations
class MyServiceAction:
    def __init__(self, name: str, display_name: str, description: str):
        self.name = name
        self.display_name = display_name
        self.description = description


class CreateTaskAction(MyServiceAction):
    def __init__(self):
        super().__init__(
            name="tasks.create",
            display_name="Create Task",
            description="Create a new task",
        )
    
    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = CreateTaskParams(**params)
        
        response = await context.http.post(
            "/tasks",
            json={
                "title": validated.title,
                "description": validated.description,
            }
        )
        
        return response


class ListTasksAction(MyServiceAction):
    def __init__(self):
        super().__init__(
            name="tasks.list",
            display_name="List Tasks",
            description="List all tasks",
        )
    
    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = TaskListParams(**params)
        
        query_params = {"limit": validated.limit}
        if validated.status:
            query_params["status"] = validated.status
        
        response = await context.http.get("/tasks", params=query_params)
        
        return response


# Provider definition
my_provider = Provider(
    name="myservice",
    display_name="My Service",
    version="1.0.0",
    description="Integration with My Service API",
    base_url="https://api.myservice.com",
    auth_type=AuthType.OAUTH2,
    icon_url="https://myservice.com/icon.png",
)

# Auth config
my_provider.auth_config = {
    "authorization_url": "https://myservice.com/oauth/authorize",
    "token_url": "https://myservice.com/oauth/token",
    "scopes": ["tasks:read", "tasks:write"],
    "scope_separator": " ",
}

# Actions
my_provider.actions = {
    "tasks.create": CreateTaskAction(),
    "tasks.list": ListTasksAction(),
}

# Triggers
my_provider.triggers = {
    "task.created": {
        "name": "task.created",
        "display_name": "Task Created",
        "description": "Triggered when a task is created",
    },
}
```

## Using Your Provider

Register and use your provider:

```python
from plugfn import PlugFn
from my_providers import my_provider

plug = PlugFn(
    database=adapter,
    auth=auth_provider,
    base_url="https://myapp.com",
    encryption_key="your-key",
    integrations={
        "myservice": {
            "client_id": "your-client-id",
            "client_secret": "your-client-secret",
        }
    }
)

# Register provider
plug.providers.register(my_provider)

# Use it!
task = await plug.myservice.tasks.create(
    user_id="user-123",
    params={
        "title": "Important task",
        "description": "This needs to be done",
    }
)
```

## Action Context

The `context` parameter in `execute()` provides:

- `context.user_id` - User ID executing the action
- `context.connection_id` - Connection ID being used
- `context.http` - Authenticated HTTP client
- `context.logger` - Logger instance
- `context.provider` - Provider info (name, base_url)
- `context.auth` - Auth info (type, credentials)

## HTTP Client Methods

The HTTP client (`context.http`) provides:

```python
# GET request
data = await context.http.get("/endpoint", params={"key": "value"})

# POST request
data = await context.http.post("/endpoint", json={"key": "value"})

# PUT request
data = await context.http.put("/endpoint", json={"key": "value"})

# PATCH request
data = await context.http.patch("/endpoint", json={"key": "value"})

# DELETE request
data = await context.http.delete("/endpoint")
```

Authentication is handled automatically based on the provider's auth type.

## Best Practices

1. **Use Pydantic models** for parameter validation
2. **Add descriptions** to all fields for better documentation
3. **Handle errors gracefully** - Let exceptions bubble up
4. **Follow naming conventions** - Use dot notation (e.g., `resource.action`)
5. **Test your provider** - Write tests for all actions
6. **Document scopes** - Clearly list required OAuth scopes
7. **Version your provider** - Use semantic versioning

## Testing Your Provider

```python
import pytest
from plugfn import PlugFn
from my_providers import my_provider

@pytest.mark.asyncio
async def test_create_task():
    plug = PlugFn(...)
    plug.providers.register(my_provider)
    
    # Mock the connection
    # ... setup mock connection ...
    
    task = await plug.myservice.tasks.create(
        user_id="test-user",
        params={"title": "Test task"}
    )
    
    assert task["title"] == "Test task"
```

## Publishing Your Provider

To share your provider:

1. Create a separate package: `plugfn-myservice`
2. Include the provider definition
3. Add documentation and examples
4. Publish to PyPI
5. Submit a PR to add it to the official provider registry

## Need Help?

- Check existing providers: `plugfn/providers/github.py`
- Read the TypeScript SDK docs for reference
- Open an issue on GitHub
- Join our Discord community
