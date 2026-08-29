"""Console SMS provider for testing."""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from .provider import SendSmsRequest, SendSmsResponse, SmsProvider, SmsProviderCapabilities


class ConsoleSmsProvider:
    """Console SMS provider that prints SMS to stdout instead of sending."""

    @property
    def name(self) -> str:
        """Provider name."""
        return "console"

    @property
    def capabilities(self) -> SmsProviderCapabilities:
        """Provider capabilities."""
        return SmsProviderCapabilities(
            max_message_length=1000,  # No real limit for console
            supports_unicode=True,
            supports_delivery_reports=False,
        )

    async def initialize(self) -> None:
        """Initialize the provider."""
        print("[ConsoleSMS] Provider initialized")

    async def send_sms(self, request: SendSmsRequest) -> SendSmsResponse:
        """Send an SMS by printing to console.

        Args:
            request: SMS send request

        Returns:
            SMS send response
        """
        # Print SMS to console
        print("\n" + "=" * 60)
        print("[ConsoleSMS] SMS Message")
        print("=" * 60)
        print(f"To: {request.to}")
        if request.from_:
            print(f"From: {request.from_}")
        print(f"Message: {request.message}")
        if request.metadata:
            print(f"Metadata: {request.metadata}")
        print("=" * 60 + "\n")

        # Simulate success
        return SendSmsResponse(
            success=True,
            provider_message_id=f"console-{uuid4()}",
            timestamp=datetime.now(),
        )

    async def is_healthy(self) -> bool:
        """Check if the provider is healthy.

        Returns:
            True (always healthy for console)
        """
        return True

    async def close(self) -> None:
        """Close the provider connection."""
        print("[ConsoleSMS] Provider closed")
