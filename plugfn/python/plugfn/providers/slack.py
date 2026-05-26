"""Slack provider implementation."""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

from ..types import Provider, AuthType


class SlackMessageParams(BaseModel):
    """Parameters for posting a Slack message."""

    channel: str = Field(..., description="Channel ID or name")
    text: str = Field(..., description="Message text")
    thread_ts: Optional[str] = Field(None, description="Thread timestamp to reply to")
    blocks: Optional[list[Dict[str, Any]]] = Field(
        None, description="Message blocks for rich formatting"
    )


class SlackChannelParams(BaseModel):
    """Parameters for creating a Slack channel."""

    name: str = Field(..., description="Channel name")
    is_private: bool = Field(False, description="Whether channel is private")


class SlackUserParams(BaseModel):
    """Parameters for getting user info."""

    user: str = Field(..., description="User ID")


class SlackAction:
    """Slack action definition."""

    def __init__(self, name: str, display_name: str, description: str):
        self.name = name
        self.display_name = display_name
        self.description = description

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Execute the action."""
        raise NotImplementedError


class SlackChatPostMessageAction(SlackAction):
    """Post a message to Slack."""

    def __init__(self):
        super().__init__(
            name="chat.postMessage",
            display_name="Post Message",
            description="Post a message to a Slack channel",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Post a message to Slack."""
        validated = SlackMessageParams(**params)

        payload = {
            "channel": validated.channel,
            "text": validated.text,
        }

        if validated.thread_ts:
            payload["thread_ts"] = validated.thread_ts

        if validated.blocks:
            payload["blocks"] = validated.blocks

        response = await context.http.post("/chat.postMessage", json=payload)

        return response


class SlackConversationsCreateAction(SlackAction):
    """Create a Slack channel."""

    def __init__(self):
        super().__init__(
            name="conversations.create",
            display_name="Create Channel",
            description="Create a new Slack channel",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Create a Slack channel."""
        validated = SlackChannelParams(**params)

        response = await context.http.post(
            "/conversations.create",
            json={
                "name": validated.name,
                "is_private": validated.is_private,
            },
        )

        return response


class SlackUsersInfoAction(SlackAction):
    """Get Slack user information."""

    def __init__(self):
        super().__init__(
            name="users.info",
            display_name="Get User Info",
            description="Get information about a Slack user",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Get user information."""
        validated = SlackUserParams(**params)

        response = await context.http.get(
            "/users.info", params={"user": validated.user}
        )

        return response


# Slack provider definition
slack_provider = Provider(
    name="slack",
    display_name="Slack",
    version="1.0.0",
    description="Slack API integration for messages, channels, and users",
    base_url="https://slack.com/api",
    auth_type=AuthType.OAUTH2,
    icon_url="https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png",
    rate_limit={"requests": 100, "window": 60000},  # 100 per minute
)

# Add auth config
slack_provider.auth_config = {
    "authorization_url": "https://slack.com/oauth/v2/authorize",
    "token_url": "https://slack.com/api/oauth.v2.access",
    "scopes": ["chat:write", "channels:manage", "users:read"],
    "scope_separator": ",",
}

# Add actions
slack_provider.actions = {
    "chat.postMessage": SlackChatPostMessageAction(),
    "conversations.create": SlackConversationsCreateAction(),
    "users.info": SlackUsersInfoAction(),
}

# Add triggers (webhooks)
slack_provider.triggers = {
    "message": {
        "name": "message",
        "display_name": "Message",
        "description": "Triggered when a message is posted",
    },
    "app_mention": {
        "name": "app_mention",
        "display_name": "App Mention",
        "description": "Triggered when the app is mentioned",
    },
}
