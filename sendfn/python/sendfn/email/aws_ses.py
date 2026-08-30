"""AWS SES email provider implementation."""

import asyncio
import base64
import re
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from ..errors import EmailProviderError
from ..models import AwsSesConfig
from .provider import (
    EmailProviderCapabilities,
    SendEmailRequest,
    SendEmailResponse,
)


class AwsSesProvider:
    """AWS SES email provider implementation."""

    def __init__(self, config: AwsSesConfig) -> None:
        """Initialize AWS SES provider.

        Args:
            config: AWS SES configuration
        """
        self.config = config
        self._client: Optional[Any] = None
        self._capabilities = EmailProviderCapabilities(
            supports_templates=False,
            supports_attachments=True,
            supports_bulk_send=True,
            supports_scheduling=False,
            max_recipients_per_email=50,
            max_attachment_size=10 * 1024 * 1024,
        )

    @property
    def name(self) -> str:
        """Provider name."""
        return "aws-ses"

    @property
    def capabilities(self) -> EmailProviderCapabilities:
        """Provider capabilities."""
        return self._capabilities

    async def initialize(self) -> None:
        """Initialize the AWS SES client."""
        try:
            import boto3
        except ImportError as error:
            raise EmailProviderError(
                "boto3 is required for AWS SES. Install with: pip install boto3"
            ) from error

        self._client = boto3.client(
            "ses",
            aws_access_key_id=self.config.access_key_id,
            aws_secret_access_key=self.config.secret_access_key,
            region_name=self.config.region,
        )

    async def send_email(self, request: SendEmailRequest) -> SendEmailResponse:
        """Send a single email via AWS SES.

        Args:
            request: Email send request

        Returns:
            Email send response
        """
        if not self._client:
            await self.initialize()

        try:
            # If there are attachments, use raw email
            if request.attachments:
                return await self._send_raw_email(request)
            else:
                return await self._send_simple_email(request)
        except Exception as e:
            return SendEmailResponse(
                success=False,
                timestamp=datetime.utcnow(),
                error={
                    "code": self._error_code(e),
                    "message": str(e),
                    "retryable": self._is_retryable_error(e),
                },
            )

    async def send_bulk_email(
        self, requests: list[SendEmailRequest]
    ) -> list[SendEmailResponse]:
        """Send multiple emails via AWS SES.

        Args:
            requests: List of email send requests

        Returns:
            List of email send responses
        """
        # AWS SES doesn't have a true bulk send API for different content
        # Send concurrently with a limit
        semaphore = asyncio.Semaphore(10)  # Max 10 concurrent sends

        async def send_with_semaphore(req: SendEmailRequest) -> SendEmailResponse:
            async with semaphore:
                return await self.send_email(req)

        responses = await asyncio.gather(
            *[send_with_semaphore(req) for req in requests],
            return_exceptions=False,
        )
        return list(responses)

    def validate_email(self, email: str) -> bool:
        """Validate an email address.

        Args:
            email: Email address to validate

        Returns:
            True if valid, False otherwise
        """
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(pattern, email))

    async def is_healthy(self) -> bool:
        """Check if AWS SES is healthy.

        Returns:
            True if healthy, False otherwise
        """
        if not self._client:
            return False

        try:
            # Try to get send quota as a health check
            self._client.get_send_quota()
            return True
        except Exception:
            return False

    async def close(self) -> None:
        """Close the AWS SES client."""
        # boto3 client doesn't need explicit closing
        self._client = None

    async def _send_simple_email(self, request: SendEmailRequest) -> SendEmailResponse:
        """Send a simple email without attachments."""
        destination = {"ToAddresses": request.to}
        if request.cc:
            destination["CcAddresses"] = request.cc
        if request.bcc:
            destination["BccAddresses"] = request.bcc

        message: dict[str, Any] = {
            "Subject": {"Data": request.subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": request.html, "Charset": "UTF-8"}},
        }

        if request.text:
            message["Body"]["Text"] = {"Data": request.text, "Charset": "UTF-8"}

        kwargs: dict[str, Any] = {
            "Source": request.from_email,
            "Destination": destination,
            "Message": message,
        }

        if request.reply_to:
            kwargs["ReplyToAddresses"] = [request.reply_to]

        if self.config.configuration_set_name:
            kwargs["ConfigurationSetName"] = self.config.configuration_set_name
        if request.tags:
            kwargs["Tags"] = [
                {"Name": name, "Value": value} for name, value in request.tags.items()
            ]

        client = self._client
        assert client is not None
        response = await asyncio.to_thread(client.send_email, **kwargs)

        return SendEmailResponse(
            success=True,
            provider_message_id=response["MessageId"],
            timestamp=datetime.utcnow(),
        )

    async def _send_raw_email(self, request: SendEmailRequest) -> SendEmailResponse:
        """Send a raw email with attachments."""
        msg = MIMEMultipart()
        msg["Subject"] = request.subject
        msg["From"] = request.from_email
        msg["To"] = ", ".join(request.to)

        if request.cc:
            msg["Cc"] = ", ".join(request.cc)
        if request.reply_to:
            msg["Reply-To"] = request.reply_to

        # Add text and HTML parts
        if request.text:
            msg.attach(MIMEText(request.text, "plain", "utf-8"))
        msg.attach(MIMEText(request.html, "html", "utf-8"))

        # Add attachments
        if request.attachments:
            for attachment in request.attachments:
                content = attachment.content
                if isinstance(content, str):
                    encoding = (attachment.encoding or "utf-8").lower()
                    if encoding == "base64":
                        content = base64.b64decode(content, validate=True)
                    elif encoding == "base64url":
                        content = base64.urlsafe_b64decode(
                            content + "=" * (-len(content) % 4)
                        )
                    else:
                        content = content.encode("utf-8" if encoding == "utf8" else encoding)
                part = MIMEApplication(content)
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=attachment.filename,
                )
                if attachment.content_type:
                    part.set_type(attachment.content_type)
                msg.attach(part)

        # Build destinations
        destinations = request.to[:]
        if request.cc:
            destinations.extend(request.cc)
        if request.bcc:
            destinations.extend(request.bcc)

        kwargs: dict[str, Any] = {
            "Source": request.from_email,
            "Destinations": destinations,
            "RawMessage": {"Data": msg.as_string()},
        }

        if self.config.configuration_set_name:
            kwargs["ConfigurationSetName"] = self.config.configuration_set_name
        if request.tags:
            kwargs["Tags"] = [
                {"Name": name, "Value": value} for name, value in request.tags.items()
            ]

        client = self._client
        assert client is not None
        response = await asyncio.to_thread(client.send_raw_email, **kwargs)

        return SendEmailResponse(
            success=True,
            provider_message_id=response["MessageId"],
            timestamp=datetime.utcnow(),
        )

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable.

        Args:
            error: Exception that occurred

        Returns:
            True if retryable, False otherwise
        """
        error_name = self._aws_error_name(error)
        retryable_errors = [
            "Throttling",
            "ThrottlingException",
            "ServiceUnavailable",
            "InternalFailure",
            "RequestTimeout",
        ]
        return error_name in retryable_errors

    def _aws_error_name(self, error: Exception) -> str:
        """Extract the stable AWS error code when boto-style response metadata exists."""
        response = getattr(error, "response", None)
        if isinstance(response, dict):
            error_block = response.get("Error")
            if isinstance(error_block, dict):
                code = error_block.get("Code")
                if isinstance(code, str) and code:
                    return code

        return type(error).__name__

    def _error_code(self, error: Exception) -> str:
        """Map provider exceptions to stable provider-facing codes."""
        error_name = self._aws_error_name(error)
        if error_name in {"Throttling", "ThrottlingException"}:
            return "THROTTLING"
        return error_name
