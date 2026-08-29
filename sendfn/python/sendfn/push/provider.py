"""Push notification provider protocol and interfaces."""

from typing import Any, Optional, Protocol


class PushProviderCapabilities:
    """Push provider capabilities."""

    def __init__(
        self,
        max_payload_size: int = 4096,
        supports_batching: bool = False,
        supports_scheduling: bool = False,
        supports_images: bool = True,
        supports_silent_push: bool = True,
    ) -> None:
        self.max_payload_size = max_payload_size
        self.supports_batching = supports_batching
        self.supports_scheduling = supports_scheduling
        self.supports_images = supports_images
        self.supports_silent_push = supports_silent_push


class SendPushRequest:
    """Push notification send request."""

    def __init__(
        self,
        device_tokens: list[str],
        title: str,
        body: str,
        data: Optional[dict[str, Any]] = None,
        image_url: Optional[str] = None,
        badge: Optional[int] = None,
        sound: Optional[str] = None,
        priority: str = "normal",
        ttl: Optional[int] = None,
        collapse_key: Optional[str] = None,
        category: Optional[str] = None,
    ) -> None:
        self.device_tokens = device_tokens
        self.title = title
        self.body = body
        self.data = data or {}
        self.image_url = image_url
        self.badge = badge
        self.sound = sound
        self.priority = priority
        self.ttl = ttl
        self.collapse_key = collapse_key
        self.category = category


class SendPushResponse:
    """Push notification send response."""

    def __init__(
        self,
        success: bool,
        success_count: int = 0,
        failed_count: int = 0,
        invalid_tokens: Optional[list[str]] = None,
        results: Optional[list[dict[str, Any]]] = None,
        timestamp: Optional[Any] = None,
    ) -> None:
        self.success = success
        self.success_count = success_count
        self.failed_count = failed_count
        self.invalid_tokens = invalid_tokens or []
        self.results = results or []
        self.timestamp = timestamp


class PushProvider(Protocol):
    """Push notification provider protocol."""

    @property
    def name(self) -> str:
        """Provider name."""
        ...

    @property
    def platform(self) -> str:
        """Platform (ios, android, web)."""
        ...

    @property
    def capabilities(self) -> PushProviderCapabilities:
        """Provider capabilities."""
        ...

    async def initialize(self) -> None:
        """Initialize the provider."""
        ...

    async def send_push(self, request: SendPushRequest) -> SendPushResponse:
        """Send a push notification.

        Args:
            request: Push send request

        Returns:
            Push send response
        """
        ...

    async def send_bulk_push(
        self, requests: list[SendPushRequest]
    ) -> list[SendPushResponse]:
        """Send multiple push notifications.

        Args:
            requests: List of push send requests

        Returns:
            List of push send responses
        """
        ...

    def validate_token(self, token: str) -> bool:
        """Validate a device token.

        Args:
            token: Device token to validate

        Returns:
            True if valid, False otherwise
        """
        ...

    async def is_healthy(self) -> bool:
        """Check if the provider is healthy.

        Returns:
            True if healthy, False otherwise
        """
        ...

    async def close(self) -> None:
        """Close the provider connection."""
        ...
