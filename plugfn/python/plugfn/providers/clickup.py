"""ClickUp provider implementation."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from ..types import AuthType, Provider
from ._shared import require_object_response


class ClickUpTaskGetParams(BaseModel):
    """Parameters for fetching a ClickUp task."""

    task_id: str = Field(..., description="ClickUp task ID")


class ClickUpTaskListParams(BaseModel):
    """Parameters for listing ClickUp tasks."""

    list_id: str = Field(..., description="ClickUp list ID")
    page: Optional[int] = Field(None, description="Result page number")


class ClickUpAction:
    """ClickUp action definition."""

    def __init__(self, name: str, display_name: str, description: str) -> None:
        self.name = name
        self.display_name = display_name
        self.description = description

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        raise NotImplementedError


class ClickUpTasksGetAction(ClickUpAction):
    """Fetch a ClickUp task."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="tasks.get",
            display_name="Get Task",
            description="Fetch a single ClickUp task by ID",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = ClickUpTaskGetParams(**params)
        response = await context.http.get(f"task/{validated.task_id}")
        return require_object_response(response)


class ClickUpTasksListAction(ClickUpAction):
    """List ClickUp tasks."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="tasks.list",
            display_name="List Tasks",
            description="List tasks in a ClickUp list",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = ClickUpTaskListParams(**params)
        query_params = {"page": validated.page} if validated.page is not None else None
        response = await context.http.get(
            f"list/{validated.list_id}/task", params=query_params
        )
        return require_object_response(response)


clickup_provider = Provider(
    name="clickup",
    display_name="ClickUp",
    version="1.0.0",
    description="ClickUp task and workspace integration",
    base_url="https://api.clickup.com/api/v2",
    auth_type=AuthType.OAUTH2,
    icon_url="https://clickup.com/favicon.ico",
    rate_limit={"requests": 100, "window": 60000},
    auth_config={
        "authorization_url": "https://app.clickup.com/api",
        "token_url": "https://api.clickup.com/api/v2/oauth/token",
        "scopes": ["tasks:read", "tasks:write", "spaces:read"],
        "scope_separator": ",",
    },
    actions={
        "tasks.get": ClickUpTasksGetAction(),
        "tasks.list": ClickUpTasksListAction(),
    },
    triggers={
        "task.updated": {
            "name": "task.updated",
            "display_name": "Task Updated",
            "description": "Triggered when a ClickUp task is updated",
        }
    },
)
