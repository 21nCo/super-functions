"""Push notification service orchestration."""

from datetime import datetime
from typing import Optional

from superfunctions.db import Adapter

from .._concurrency import map_with_concurrency, resolve_concurrency
from ..errors import PushProviderError
from ..models import Platform, PushNotification, SendPushParams
from .device_manager import DeviceTokenManager
from .provider import PushProvider

PLATFORM_ORDER: tuple[Platform, ...] = ("android", "ios", "web")


class PushService:
    """Push notification service that coordinates providers and device management."""

    def __init__(
        self,
        providers: dict[Platform, PushProvider],
        db: Adapter,
        device_manager: DeviceTokenManager,
        bulk_concurrency: int = 5,
    ) -> None:
        """Initialize push service.

        Args:
            providers: Map of platform to push providers (FCM, APNS)
            db: Database adapter
            device_manager: Device token manager
        """
        self.providers = providers
        self.db = db
        self.device_manager = device_manager
        self.bulk_concurrency = resolve_concurrency(bulk_concurrency, 5)

    async def send_push(self, params: SendPushParams) -> PushNotification:
        """Send a push notification.

        Args:
            params: Push send parameters

        Returns:
            Push notification record
        """
        from ..database.helpers import (
            create_push_notification,
            get_push_notification,
            record_event,
            update_push_notification,
        )

        # Normalize user IDs
        user_ids = params.user_id if isinstance(params.user_id, list) else [params.user_id]

        # Resolve user IDs to device tokens
        tokens: list[str] = []
        platform_tokens: dict[Platform, list[str]] = {}

        for user_id in user_ids:
            devices = await self.device_manager.get_active_devices(user_id)
            for device in devices:
                tokens.append(device.token)
                if device.platform not in platform_tokens:
                    platform_tokens[device.platform] = []
                platform_tokens[device.platform].append(device.token)

        # If no devices found, create failed notification
        if not tokens:
            notification = await create_push_notification(
                self.db,
                {
                    "userId": ",".join(user_ids),
                    "title": params.title,
                    "body": params.body,
                    "data": params.data,
                    "deviceTokens": [],
                    "platform": "web",  # Default
                    "provider": "none",
                    "status": "failed",
                    "sentCount": 0,
                    "failedCount": 0,
                    "sentAt": None,
                    "metadata": {"error": "No active devices found"},
                },
            )
            return notification

        ordered_platforms = [
            platform for platform in PLATFORM_ORDER if platform_tokens.get(platform)
        ]
        logical_notification_id: Optional[str] = None
        notification_ids: list[str] = []
        aggregate_sent_count = 0
        aggregate_failed_count = 0
        logical_sent_at: Optional[datetime] = None

        for platform in ordered_platforms:
            p_tokens = platform_tokens[platform]
            provider = self.providers.get(platform)

            if not provider:
                continue

            # Create notification record
            notification = await create_push_notification(
                self.db,
                {
                    "userId": ",".join(user_ids),
                    "title": params.title,
                    "body": params.body,
                    "data": params.data,
                    "deviceTokens": p_tokens,
                    "platform": platform,
                    "provider": provider.name,
                    "status": "pending",
                    "sentCount": 0,
                    "failedCount": 0,
                    "sentAt": None,
                    "metadata": params.metadata or {},
                },
            )
            notification_ids.append(str(notification.id))
            if logical_notification_id is None:
                logical_notification_id = str(notification.id)

            try:
                # Send via provider
                from .provider import SendPushRequest

                response = await provider.send_push(
                    SendPushRequest(
                        device_tokens=p_tokens,
                        title=params.title,
                        body=params.body,
                        data=params.data,
                        image_url=params.image_url,
                        badge=params.badge,
                        sound=params.sound,
                        priority=params.priority,
                        ttl=params.ttl,
                        collapse_key=params.collapse_key,
                        category=params.category,
                    )
                )

                if response.invalid_tokens:
                    await self.device_manager.deactivate_tokens(response.invalid_tokens)

                # Update record
                await update_push_notification(
                    self.db,
                    str(notification.id),
                    {
                        "status": "sent" if response.success else "failed",
                        "sentCount": response.success_count,
                        "failedCount": response.failed_count,
                        "sentAt": response.timestamp,
                        "metadata": {
                            **(params.metadata or {}),
                            "results": response.results,
                        },
                    },
                )

                # Record event
                await record_event(
                    self.db,
                    {
                        "referenceId": str(notification.id),
                        "referenceType": "push",
                        "eventType": "sent" if response.success else "failed",
                        "provider": provider.name,
                        "providerEventId": None,
                        "recipientEmail": None,
                        "recipientPhone": None,
                        "deviceToken": None,  # Multiple tokens
                        "metadata": {
                            "successCount": response.success_count,
                            "failedCount": response.failed_count,
                        },
                        "eventTimestamp": response.timestamp,
                    },
                )

                aggregate_sent_count += response.success_count
                aggregate_failed_count += response.failed_count
                if logical_sent_at is None:
                    logical_sent_at = response.timestamp

            except Exception as error:
                # Update notification as failed
                await update_push_notification(
                    self.db,
                    str(notification.id),
                    {
                        "status": "failed",
                        "metadata": {**(params.metadata or {}), "error": str(error)},
                    },
                )

                # Record failed event
                await record_event(
                    self.db,
                    {
                        "referenceId": str(notification.id),
                        "referenceType": "push",
                        "eventType": "failed",
                        "provider": provider.name,
                        "providerEventId": None,
                        "recipientEmail": None,
                        "recipientPhone": None,
                        "deviceToken": None,
                        "metadata": {"error": str(error)},
                        "eventTimestamp": datetime.now(),
                    },
                )

                raise error

        if not logical_notification_id:
            raise PushProviderError("Failed to process push for any platform")

        existing_logical_notification = await get_push_notification(
            self.db,
            logical_notification_id,
        )
        logical_notification = await update_push_notification(
            self.db,
            logical_notification_id,
            {
                "status": "sent" if aggregate_sent_count > 0 else "failed",
                "sentCount": aggregate_sent_count,
                "failedCount": aggregate_failed_count,
                "sentAt": logical_sent_at,
                "metadata": {
                    **(existing_logical_notification.metadata if existing_logical_notification else {}),
                    **(params.metadata or {}),
                    "notificationIds": notification_ids,
                },
            },
        )

        return logical_notification

    async def send_bulk_push(
        self, notifications: list[SendPushParams]
    ) -> list[PushNotification]:
        """Send multiple push notifications.

        Args:
            notifications: List of push send parameters

        Returns:
            List of push notification records
        """
        return await map_with_concurrency(
            notifications,
            self.bulk_concurrency,
            lambda notification, _index: self.send_push(notification),
        )
