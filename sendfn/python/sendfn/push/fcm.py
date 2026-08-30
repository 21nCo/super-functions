"""FCM (Firebase Cloud Messaging) provider for push notifications."""

import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import uuid4

from ..errors import PushProviderError
from ..models import FcmConfig
from .provider import (
    PushProviderCapabilities,
    SendPushRequest,
    SendPushResponse,
)


class FcmProvider:
    """Firebase Cloud Messaging provider for Android and web push notifications."""

    def __init__(self, config: FcmConfig) -> None:
        """Initialize FCM provider.

        Args:
            config: FCM configuration
        """
        self.config = config
        self._app: Optional[Any] = None
        self._firebase_admin: Optional[Any] = None
        self._messaging: Optional[Any] = None
        self._app_name = f"sendfn-{uuid4()}"

    @property
    def name(self) -> str:
        """Provider name."""
        return "fcm"

    @property
    def platform(self) -> str:
        """Platform (android/web)."""
        return "android"

    @property
    def capabilities(self) -> PushProviderCapabilities:
        """Provider capabilities."""
        return PushProviderCapabilities(
            max_payload_size=4096,
            supports_batching=True,  # FCM supports multicast
            supports_scheduling=False,
            supports_images=True,
            supports_silent_push=True,
        )

    async def initialize(self) -> None:
        """Initialize Firebase app."""
        try:
            import firebase_admin  # type: ignore[import-untyped]
            from firebase_admin import credentials, messaging
        except ImportError as error:  # pragma: no cover - depends on optional extra
            raise PushProviderError(
                "FCM provider requires the firebase-admin dependency"
            ) from error

        self._firebase_admin = firebase_admin
        self._messaging = messaging

        if self._app is not None:
            return

        # Each provider owns a named app so it never borrows or deletes the
        # host application's default Firebase app.
        cred = credentials.Certificate(self.config.service_account_key)
        self._app = firebase_admin.initialize_app(
            cred,
            options={"projectId": self.config.project_id} if self.config.project_id else None,
            name=self._app_name,
        )

    async def send_push(self, request: SendPushRequest) -> SendPushResponse:
        """Send a push notification via FCM.

        Args:
            request: Push send request

        Returns:
            Push send response
        """
        if not self._app:
            await self.initialize()
        assert self._messaging is not None

        # Build FCM multicast message
        # Convert all data values to strings (FCM requirement)
        data_str: dict[str, str] = {}
        if request.data:
            for key, value in request.data.items():
                data_str[key] = str(value) if not isinstance(value, str) else value

        invalid_tokens: list[str] = []
        results: list[dict[str, Any]] = []
        success_count = 0
        failed_count = 0

        for start in range(0, len(request.device_tokens), 500):
            try:
                chunk_tokens = request.device_tokens[start : start + 500]
                message = self._messaging.MulticastMessage(
                    tokens=chunk_tokens,
                    notification=self._messaging.Notification(
                        title=request.title,
                        body=request.body,
                        image=request.image_url,
                    ),
                    data=data_str if data_str else None,
                    android=None if request.platform == "web" else self._messaging.AndroidConfig(
                        priority=request.priority,
                        ttl=timedelta(seconds=request.ttl) if request.ttl is not None else None,
                        collapse_key=request.collapse_key,
                        notification=self._messaging.AndroidNotification(
                            sound=request.sound or "default",
                        ),
                    ),
                    webpush=self._messaging.WebpushConfig(
                        headers={
                            **({"TTL": str(request.ttl)} if request.ttl is not None else {}),
                            **({"Topic": request.collapse_key} if request.collapse_key else {}),
                            **({"Urgency": "high" if request.priority == "high" else "normal"} if request.priority else {}),
                        },
                        data={"sound": request.sound} if request.sound else None,
                    ) if request.platform == "web" else None,
                )
                response = await asyncio.to_thread(
                    self._messaging.send_each_for_multicast,
                    message,
                )
                success_count += response.success_count
                failed_count += response.failure_count

                for idx, send_response in enumerate(response.responses):
                    token = chunk_tokens[idx]

                    if not send_response.success and send_response.exception:
                        error_code = getattr(send_response.exception, "code", None)
                        if error_code in [
                            "messaging/registration-token-not-registered",
                            "messaging/invalid-registration-token",
                            "messaging/invalid-argument",
                        ]:
                            invalid_tokens.append(token)

                    results.append(
                        {
                            "token": token,
                            "success": send_response.success,
                            "error": (
                                send_response.exception.message
                                if send_response.exception
                                else None
                            ),
                        }
                    )
            except Exception as error:
                if not results:
                    raise PushProviderError(f"FCM Error: {str(error)}") from error

                unattempted_tokens = request.device_tokens[start:]
                failed_count += len(unattempted_tokens)
                results.extend(
                    {
                        "token": token,
                        "success": False,
                        "error": f"FCM Error: {str(error)}",
                    }
                    for token in unattempted_tokens
                )
                break

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
        # Basic validation - FCM tokens are non-empty strings
        return bool(token and isinstance(token, str))

    async def is_healthy(self) -> bool:
        """Check if the provider is healthy.

        Returns:
            True if healthy, False otherwise
        """
        # Hard to check without sending a test message
        return self._app is not None

    async def close(self) -> None:
        """Close the provider connection."""
        if self._app and self._firebase_admin:
            self._firebase_admin.delete_app(self._app)
            self._app = None
