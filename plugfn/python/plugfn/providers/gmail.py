"""Gmail provider implementation."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from ..types import AuthType, Provider
from ._shared import require_object_response


class GmailMailSyncParams(BaseModel):
    """Parameters for Gmail sync."""

    max_results: Optional[int] = Field(None, description="Maximum number of messages to list")
    query: Optional[str] = Field(None, description="Gmail search query")


class GmailMessageGetParams(BaseModel):
    """Parameters for fetching a Gmail message."""

    message_id: str = Field(..., description="Gmail message ID")


class GmailAction:
    """Gmail action definition."""

    def __init__(self, name: str, display_name: str, description: str) -> None:
        self.name = name
        self.display_name = display_name
        self.description = description

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        raise NotImplementedError


class GmailMailSyncAction(GmailAction):
    """List Gmail messages for sync/bootstrap flows."""

    def __init__(self) -> None:
        super().__init__(
            name="mail.sync",
            display_name="Sync Mail",
            description="List Gmail messages for sync or incremental polling",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = GmailMailSyncParams(**params)
        query_params: Dict[str, Any] = {}
        if validated.max_results is not None:
            query_params["maxResults"] = validated.max_results
        if validated.query:
            query_params["q"] = validated.query
        response = await context.http.get("messages", params=query_params or None)
        return require_object_response(response)


class GmailMessageGetAction(GmailAction):
    """Fetch a Gmail message."""

    def __init__(self) -> None:
        super().__init__(
            name="messages.get",
            display_name="Get Message",
            description="Fetch a single Gmail message by ID",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = GmailMessageGetParams(**params)
        response = await context.http.get(f"messages/{validated.message_id}")
        return require_object_response(response)


gmail_provider = Provider(
    name="gmail",
    display_name="Gmail",
    version="1.0.0",
    description="Gmail mail sync and watch integration",
    base_url="https://gmail.googleapis.com/gmail/v1/users/me",
    auth_type=AuthType.OAUTH2,
    icon_url="https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
    rate_limit={"requests": 250, "window": 60000},
    auth_config={
        "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": [
            "https://www.googleapis.com/auth/gmail.readonly",
            "openid",
            "email",
            "profile",
        ],
        "scope_separator": " ",
    },
    actions={
        "mail.sync": GmailMailSyncAction(),
        "messages.get": GmailMessageGetAction(),
    },
    triggers={
        "mail.update": {
            "name": "mail.update",
            "display_name": "Mail Updated",
            "description": "Triggered when Gmail push/watch state signals mailbox updates",
        }
    },
)
