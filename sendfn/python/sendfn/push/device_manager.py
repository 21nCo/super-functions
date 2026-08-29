"""Device token manager for push notifications."""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from superfunctions.db import Adapter

from ..models import DeviceToken, Platform, RegisterDeviceParams
from ..errors import ValidationError


class DeviceTokenManager:
    """Manager for device token registration and retrieval."""

    def __init__(self, db: Adapter) -> None:
        """Initialize device token manager.

        Args:
            db: Database adapter
        """
        self.db = db

    async def register_device(self, params: RegisterDeviceParams) -> DeviceToken:
        """Register or update a device token.

        Args:
            params: Device registration parameters

        Returns:
            Device token record
        """
        now = datetime.utcnow()

        # Check if device already exists (userId + token + platform)
        # Using find to check for existing token
        from ..database.helpers import find_device_token

        existing = await find_device_token(
            self.db,
            user_id=params.user_id,
            token=params.token,
            platform=params.platform,
        )

        if existing:
            # Update existing device
            from ..database.helpers import update_device_token

            return await update_device_token(
                self.db,
                device_id=str(existing.id),
                isActive=True,
                lastUsedAt=now,
                appVersion=params.app_version,
                deviceInfo=params.device_info,
            )
        else:
            # Create new device token
            from ..database.helpers import create_device_token

            return await create_device_token(
                self.db,
                id=uuid4(),
                userId=params.user_id,
                token=params.token,
                platform=params.platform,
                appVersion=params.app_version,
                deviceInfo=params.device_info,
                isActive=True,
                lastUsedAt=now,
                createdAt=now,
                updatedAt=now,
            )

    async def get_active_devices(
        self, user_id: str, platform: Optional[Platform] = None
    ) -> list[DeviceToken]:
        """Get active device tokens for a user.

        Args:
            user_id: User ID
            platform: Optional platform filter

        Returns:
            List of active device tokens
        """
        from ..database.helpers import find_device_tokens

        return await find_device_tokens(
            self.db,
            user_id=user_id,
            platform=platform,
            is_active=True,
        )

    async def deactivate_tokens(self, tokens: list[str]) -> None:
        """Deactivate device tokens (e.g., when they're invalid).

        Args:
            tokens: List of device tokens to deactivate
        """
        from ..database.helpers import deactivate_device_tokens

        await deactivate_device_tokens(self.db, tokens=tokens)

    async def refresh_device_token(
        self,
        old_token: str,
        new_token: str,
        user_id: str,
        platform: Platform,
    ) -> DeviceToken:
        """Replace an old device token with a new active token."""
        from ..database.helpers import find_device_token, update_device_token

        existing = await find_device_token(
            self.db,
            user_id=user_id,
            token=old_token,
            platform=platform,
        )
        if existing is None:
            raise ValidationError(
                "Old device token was not found for the supplied user and platform"
            )

        refreshed = await self.register_device(
            RegisterDeviceParams(
                userId=user_id,
                token=new_token,
                platform=platform,
                appVersion=existing.app_version,
                deviceInfo=existing.device_info,
            )
        )
        if str(refreshed.id) != str(existing.id):
            await update_device_token(
                self.db,
                device_id=str(existing.id),
                isActive=False,
            )
        return refreshed

    async def cleanup_inactive_devices(self, older_than: datetime) -> int:
        """Delete inactive device records older than the provided cutoff."""
        from ..database.helpers import delete_device_tokens, find_inactive_device_tokens

        inactive_devices = await find_inactive_device_tokens(self.db, older_than=older_than)
        return await delete_device_tokens(
            self.db,
            device_ids=[device.id for device in inactive_devices],
        )

    async def delete_device(self, device_id: str) -> None:
        """Delete a device token.

        Args:
            device_id: Device token ID
        """
        from ..database.helpers import delete_device_token

        await delete_device_token(self.db, device_id=device_id)
