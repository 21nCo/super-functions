"""Push notification package for sendfn."""

from typing import Any

from .device_manager import DeviceTokenManager
from .provider import (
    PushProvider,
    PushProviderCapabilities,
    SendPushRequest,
    SendPushResponse,
)
from .service import PushService

__all__ = [
    "PushProvider",
    "PushProviderCapabilities",
    "SendPushRequest",
    "SendPushResponse",
    "FcmProvider",
    "ApnsProvider",
    "DeviceTokenManager",
    "PushService",
]


def __getattr__(name: str) -> Any:
    if name == "FcmProvider":
        from .fcm import FcmProvider

        return FcmProvider
    if name == "ApnsProvider":
        from .apns import ApnsProvider

        return ApnsProvider
    raise AttributeError(f"module 'sendfn.push' has no attribute {name!r}")
