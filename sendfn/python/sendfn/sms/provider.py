"""SMS provider protocol (basic structure)."""

from datetime import datetime
from typing import Any, Optional, Protocol


class SmsProviderCapabilities:
    """SMS provider capabilities."""

    def __init__(
        self,
        max_message_length: int = 160,
        supports_unicode: bool = True,
        supports_delivery_reports: bool = False,
    ) -> None:
        self.max_message_length = max_message_length
        self.supports_unicode = supports_unicode
        self.supports_delivery_reports = supports_delivery_reports


class SendSmsRequest:
    """SMS send request."""

    def __init__(
        self,
        to: str,
        message: str,
        from_: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        self.to = to
        self.message = message
        self.from_ = from_
        self.metadata = metadata or {}


class SendSmsResponse:
    """SMS send response."""

    def __init__(
        self,
        success: bool,
        provider_message_id: Optional[str] = None,
        error: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> None:
        self.success = success
        self.provider_message_id = provider_message_id
        self.error = error
        self.timestamp = timestamp or datetime.now()


class SmsProvider(Protocol):
    """SMS provider protocol."""

    @property
    def name(self) -> str:
        """Provider name."""
        ...

    @property
    def capabilities(self) -> SmsProviderCapabilities:
        """Provider capabilities."""
        ...

    async def initialize(self) -> None:
        """Initialize the provider."""
        ...

    async def send_sms(self, request: SendSmsRequest) -> SendSmsResponse:
        """Send an SMS.

        Args:
            request: SMS send request

        Returns:
            SMS send response
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
