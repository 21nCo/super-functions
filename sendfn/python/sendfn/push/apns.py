"""APNS (Apple Push Notification Service) provider for push notifications."""

from datetime import datetime
from typing import Any, Optional

from .._concurrency import map_with_concurrency
from ..errors import PushProviderError
from ..models import ApnsConfig
from .provider import (
    PushProviderCapabilities,
    SendPushRequest,
    SendPushResponse,
)


class ApnsProvider:
    """Apple Push Notification Service provider for iOS push notifications."""

    def __init__(self, config: ApnsConfig) -> None:
        """Initialize APNS provider.

        Args:
            config: APNS configuration
        """
        self.config = config
        self._client: Optional[Any] = None
        self._notification_request_cls: Optional[Any] = None
        self._apns_class: Optional[Any] = None

    @property
    def name(self) -> str:
        """Provider name."""
        return "apns"

    @property
    def platform(self) -> str:
        """Platform (ios)."""
        return "ios"

    @property
    def capabilities(self) -> PushProviderCapabilities:
        """Provider capabilities."""
        return PushProviderCapabilities(
            max_payload_size=4096,
            supports_batching=False,  # APNS sends one by one
            supports_scheduling=False,
            supports_images=True,  # Via mutable-content
            supports_silent_push=True,
        )

    async def initialize(self) -> None:
        """Initialize APNS client."""
        try:
            from aioapns import APNs, NotificationRequest
        except ImportError as error:  # pragma: no cover - depends on optional extra
            raise PushProviderError(
                "APNS provider requires the aioapns dependency"
            ) from error

        self._apns_class = APNs
        self._notification_request_cls = NotificationRequest
        self._client = APNs(
            key=self.config.key,
            key_id=self.config.key_id,
            team_id=self.config.team_id,
            topic=self.config.bundle_id,
            use_sandbox=not self.config.production,
        )

    async def send_push(self, request: SendPushRequest) -> SendPushResponse:
        """Send a push notification via APNS.

        Args:
            request: Push send request

        Returns:
            Push send response
        """
        if not self._client:
            await self.initialize()
        client = self._client
        notification_request_cls = self._notification_request_cls
        assert client is not None
        assert notification_request_cls is not None

        results: list[dict[str, Any]] = []
        invalid_tokens: list[str] = []
        success_count = 0
        failed_count = 0

        # Build alert payload
        alert = {
            "title": request.title,
            "body": request.body,
        }

        # Build APS payload
        aps: dict[str, Any] = {
            "alert": alert,
        }

        if request.badge is not None:
            aps["badge"] = request.badge

        if request.sound:
            aps["sound"] = request.sound

        if request.category:
            aps["category"] = request.category

        # Add image support via mutable-content
        if request.image_url:
            aps["mutable-content"] = 1

        # Build notification payload
        payload: dict[str, Any] = {"aps": aps}

        # Add custom data
        if request.data:
            payload.update(request.data)

        # Add image URL to custom data if provided
        if request.image_url:
            payload["image_url"] = request.image_url

        # Send to each token with the provider concurrency cap.
        async def send_to_token(token: str, _index: int) -> dict[str, Any]:
            try:
                notification = notification_request_cls(
                    device_token=token,
                    message=payload,
                    priority=(10 if request.priority == "high" else 5),
                    time_to_live=request.ttl,
                    collapse_key=request.collapse_key,
                )

                response = await client.send_notification(notification)
                if not response.is_successful:
                    reason = response.description or response.status
                    if reason in ["BadDeviceToken", "Unregistered"]:
                        invalid_tokens.append(token)
                    return {"token": token, "success": False, "error": str(reason)}

                return {"token": token, "success": True}

            except Exception as error:
                error_msg = str(error)
                error_reason = getattr(error, "reason", None)

                # Check if token is invalid
                if error_reason in ["BadDeviceToken", "Unregistered"]:
                    invalid_tokens.append(token)

                return {
                    "token": token,
                    "success": False,
                    "error": error_reason or error_msg,
                }

        send_results = await map_with_concurrency(
            request.device_tokens,
            10,
            send_to_token,
        )

        # Process results
        for result in send_results:
            results.append(result)
            if result["success"]:
                success_count += 1
            else:
                failed_count += 1

        return SendPushResponse(
            success=failed_count == 0,
            success_count=success_count,
            failed_count=failed_count,
            invalid_tokens=invalid_tokens,
            results=results,
            timestamp=datetime.now(),
        )

    async def send_bulk_push(
        self, requests: list[SendPushRequest]
    ) -> list[SendPushResponse]:
        """Send multiple push notifications.

        Args:
            requests: List of push send requests

        Returns:
            List of push send responses
        """
        results: list[SendPushResponse] = []
        for request in requests:
            results.append(await self.send_push(request))
        return results

    def validate_token(self, token: str) -> bool:
        """Validate a device token.

        Args:
            token: Device token to validate

        Returns:
            True if valid, False otherwise
        """
        # Basic validation - APNS tokens are non-empty strings (64 hex chars typically)
        return bool(token and isinstance(token, str))

    async def is_healthy(self) -> bool:
        """Check if the provider is healthy.

        Returns:
            True if healthy, False otherwise
        """
        return self._client is not None

    async def close(self) -> None:
        """Close the provider connection."""
        if self._client:
            # aioapns doesn't have an explicit close method
            # The connection is managed automatically
            self._client = None
