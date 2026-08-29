"""Email provider protocol and interfaces."""

from typing import Any, Optional, Protocol


class EmailProviderCapabilities:
    """Email provider capabilities."""

    def __init__(
        self,
        supports_templates: bool = False,
        supports_attachments: bool = True,
        supports_bulk_send: bool = False,
        supports_scheduling: bool = False,
        max_recipients_per_email: int = 50,
        max_attachment_size: int = 10 * 1024 * 1024,  # 10MB
    ) -> None:
        self.supports_templates = supports_templates
        self.supports_attachments = supports_attachments
        self.supports_bulk_send = supports_bulk_send
        self.supports_scheduling = supports_scheduling
        self.max_recipients_per_email = max_recipients_per_email
        self.max_attachment_size = max_attachment_size


class SendEmailRequest:
    """Email send request."""

    def __init__(
        self,
        from_email: str,
        to: list[str],
        subject: str,
        html: str,
        cc: Optional[list[str]] = None,
        bcc: Optional[list[str]] = None,
        text: Optional[str] = None,
        attachments: Optional[list[Any]] = None,
        reply_to: Optional[str] = None,
        tags: Optional[dict[str, str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        self.from_email = from_email
        self.to = to
        self.subject = subject
        self.html = html
        self.cc = cc
        self.bcc = bcc
        self.text = text
        self.attachments = attachments
        self.reply_to = reply_to
        self.tags = tags or {}
        self.metadata = metadata or {}


class SendEmailResponse:
    """Email send response."""

    def __init__(
        self,
        success: bool,
        message_id: Optional[str] = None,
        provider_message_id: Optional[str] = None,
        timestamp: Optional[Any] = None,
        error: Optional[dict[str, Any]] = None,
    ) -> None:
        self.success = success
        self.message_id = message_id
        self.provider_message_id = provider_message_id
        self.timestamp = timestamp
        self.error = error


class EmailProvider(Protocol):
    """Email provider protocol."""

    @property
    def name(self) -> str:
        """Provider name."""
        ...

    @property
    def capabilities(self) -> EmailProviderCapabilities:
        """Provider capabilities."""
        ...

    async def initialize(self) -> None:
        """Initialize the provider."""
        ...

    async def send_email(self, request: SendEmailRequest) -> SendEmailResponse:
        """Send a single email.

        Args:
            request: Email send request

        Returns:
            Email send response
        """
        ...

    async def send_bulk_email(
        self, requests: list[SendEmailRequest]
    ) -> list[SendEmailResponse]:
        """Send multiple emails.

        Args:
            requests: List of email send requests

        Returns:
            List of email send responses
        """
        ...

    def validate_email(self, email: str) -> bool:
        """Validate an email address.

        Args:
            email: Email address to validate

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
