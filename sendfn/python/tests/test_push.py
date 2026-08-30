"""Push/device scalability and determinism tests for phase 5."""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from sendfn._concurrency import map_with_concurrency
from sendfn.database.memory import MemoryAdapter
from sendfn.errors import SendfnError, ValidationError
from sendfn.models import FcmConfig, RegisterDeviceParams, SendPushParams
from sendfn.push.apns import ApnsProvider
from sendfn.push.device_manager import DeviceTokenManager
from sendfn.push.fcm import FcmProvider
from sendfn.push.provider import PushProviderCapabilities, SendPushRequest, SendPushResponse
from sendfn.push.service import PushService


class FakePushProvider:
    """Push provider stub with concurrency tracking."""

    def __init__(
        self,
        name: str,
        platform: str,
        *,
        invalid_tokens: list[str] | None = None,
        delay: float = 0.005,
    ) -> None:
        self._name = name
        self._platform = platform
        self.invalid_tokens = invalid_tokens or []
        self.delay = delay
        self.active = 0
        self.observed_max_concurrency = 0
        self.send_calls = 0

    @property
    def name(self) -> str:
        return self._name

    @property
    def platform(self) -> str:
        return self._platform

    @property
    def capabilities(self) -> PushProviderCapabilities:
        return PushProviderCapabilities(supports_batching=True)

    async def initialize(self) -> None:
        return None

    async def send_push(self, request: SendPushRequest) -> SendPushResponse:
        self.send_calls += 1
        self.active += 1
        self.observed_max_concurrency = max(self.observed_max_concurrency, self.active)
        await asyncio.sleep(self.delay)
        self.active -= 1

        invalid = [token for token in request.device_tokens if token in self.invalid_tokens]
        failed = set(invalid)
        return SendPushResponse(
            success=len(failed) < len(request.device_tokens),
            success_count=len(request.device_tokens) - len(failed),
            failed_count=len(failed),
            invalid_tokens=invalid,
            results=[
                {
                    "token": token,
                    "success": token not in failed,
                    "error": "invalid token" if token in failed else None,
                }
                for token in request.device_tokens
            ],
            timestamp=datetime(2026, 4, 5, 0, 0, 0),
        )

    async def send_bulk_push(self, requests: list[SendPushRequest]) -> list[SendPushResponse]:
        return [await self.send_push(request) for request in requests]

    def validate_token(self, token: str) -> bool:
        return bool(token)

    async def is_healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


def assert_non_sequential(observed_max_concurrency: int) -> None:
    if observed_max_concurrency <= 1:
        raise SendfnError(
            "Bulk send path is purely sequential",
            code="SENDFN_BULK_SEQUENTIAL_PATH",
            retryable=False,
        )


def assert_apns_concurrency_cap(observed_max_concurrency: int) -> None:
    if observed_max_concurrency > 10:
        raise SendfnError(
            "APNS concurrency cap exceeded",
            code="SENDFN_INTERNAL_ERROR",
            retryable=False,
        )


def get_records(db: MemoryAdapter, model: str) -> list[dict[str, Any]]:
    return list(db._get_or_create_storage(model).values())


@pytest.mark.asyncio
async def test_map_with_concurrency_preserves_none_results_and_order() -> None:
    results = await map_with_concurrency(
        ["a", "b", "c"],
        2,
        lambda item, _index: asyncio.sleep(0, result=None if item != "b" else "kept"),
    )

    assert results == [None, "kept", None]


@pytest.mark.asyncio
async def test_fcm_chunks_batches_at_500(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = object.__new__(FcmProvider)
    provider.config = None
    provider._app = object()
    provider._messaging = type("Messaging", (), {})()
    provider._firebase_admin = None
    chunk_sizes: list[int] = []
    to_thread_calls = 0

    async def fake_to_thread(function: Any, *args: Any) -> Any:
        nonlocal to_thread_calls
        to_thread_calls += 1
        return function(*args)

    monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

    class FakeResponse:
        def __init__(self, size: int) -> None:
            self.success_count = size
            self.failure_count = 0
            self.responses = [type("Resp", (), {"success": True, "exception": None})() for _ in range(size)]

    def fake_send_each_for_multicast(message: Any) -> FakeResponse:
        chunk_sizes.append(len(message.tokens))
        return FakeResponse(len(message.tokens))

    provider._messaging.send_each_for_multicast = fake_send_each_for_multicast
    provider._messaging.MulticastMessage = lambda **kwargs: type("Msg", (), kwargs)()
    provider._messaging.Notification = lambda **kwargs: type("Notification", (), kwargs)()
    provider._messaging.AndroidConfig = lambda **kwargs: type("AndroidConfig", (), kwargs)()
    provider._messaging.AndroidNotification = lambda **kwargs: type("AndroidNotification", (), kwargs)()

    response = await provider.send_push(
        SendPushRequest(
            device_tokens=[f"tok-{index}" for index in range(501)],
            title="Hello",
            body="World",
        )
    )

    assert chunk_sizes == [500, 1]
    assert to_thread_calls == 2
    assert response.success_count == 501
    assert response.failed_count == 0


@pytest.mark.asyncio
async def test_fcm_owns_a_named_app_without_reusing_the_host_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    default_app = object()
    owned_app = object()
    initialized: list[dict[str, Any]] = []
    deleted: list[object] = []
    firebase_admin = SimpleNamespace(
        _apps={"[DEFAULT]": default_app},
        credentials=SimpleNamespace(Certificate=lambda value: ("credential", value)),
        messaging=SimpleNamespace(),
        initialize_app=lambda credential, *, options, name: (
            initialized.append({"credential": credential, "options": options, "name": name})
            or owned_app
        ),
        delete_app=lambda app: deleted.append(app),
    )
    monkeypatch.setitem(sys.modules, "firebase_admin", firebase_admin)

    provider = FcmProvider(FcmConfig(serviceAccountKey={"project_id": "sendfn"}))
    await provider.initialize()
    await provider.close()

    assert initialized == [{
        "credential": ("credential", {"project_id": "sendfn"}),
        "options": None,
        "name": provider._app_name,
    }]
    assert provider._app_name != "[DEFAULT]"
    assert deleted == [owned_app]


@pytest.mark.asyncio
async def test_apns_caps_in_flight_concurrency_at_ten() -> None:
    provider = object.__new__(ApnsProvider)
    provider.config = None
    provider._notification_request_cls = None
    provider._apns_class = None
    active = 0
    observed_max = 0

    class FakeClient:
        async def send_notification(self, _notification: Any) -> Any:
            nonlocal active, observed_max
            active += 1
            observed_max = max(observed_max, active)
            await asyncio.sleep(0.005)
            active -= 1
            return type("Result", (), {"is_successful": True})()

    provider._client = FakeClient()
    provider.config = type("Config", (), {"bundle_id": "org.example.app"})()

    class FakeNotificationRequest:
        def __init__(self, **kwargs: Any) -> None:
            self.__dict__.update(kwargs)

    provider._notification_request_cls = FakeNotificationRequest
    response = await provider.send_push(
        SendPushRequest(
            device_tokens=[f"ios-{index}" for index in range(25)],
            title="Hello",
            body="World",
        )
    )

    assert response.success_count == 25
    assert response.failed_count == 0
    assert observed_max <= 10
    assert_apns_concurrency_cap(observed_max)
    with pytest.raises(SendfnError) as exc_info:
        assert_apns_concurrency_cap(11)
    assert exc_info.value.code == "SENDFN_INTERNAL_ERROR"
    assert str(exc_info.value) == "APNS concurrency cap exceeded"


@pytest.mark.asyncio
async def test_apns_uses_client_topic_and_reports_unsuccessful_responses() -> None:
    provider = object.__new__(ApnsProvider)
    provider.config = type("Config", (), {"bundle_id": "org.example.app"})()
    captured: list[dict[str, Any]] = []

    class FakeNotificationRequest:
        def __init__(self, **kwargs: Any) -> None:
            captured.append(kwargs)

    class FakeClient:
        async def send_notification(self, _notification: Any) -> Any:
            return type(
                "Result",
                (),
                {"is_successful": False, "description": "BadDeviceToken", "status": "410"},
            )()

    provider._notification_request_cls = FakeNotificationRequest
    provider._client = FakeClient()
    response = await provider.send_push(
        SendPushRequest(
            device_tokens=["invalid-token"],
            title="Hello",
            body="World",
            collapse_key="thread-1",
        )
    )

    assert captured[0]["collapse_key"] == "thread-1"
    assert "apns_topic" not in captured[0]
    assert response.success is False
    assert response.invalid_tokens == ["invalid-token"]


@pytest.mark.asyncio
async def test_push_service_returns_stable_platform_result_and_deactivates_invalid_tokens() -> None:
    db = MemoryAdapter()
    device_manager = DeviceTokenManager(db)
    await device_manager.register_device(RegisterDeviceParams(userId="user-1", token="android-good", platform="android"))
    await device_manager.register_device(RegisterDeviceParams(userId="user-1", token="ios-bad", platform="ios"))
    await device_manager.register_device(RegisterDeviceParams(userId="user-1", token="web-good", platform="web"))

    service = PushService(
        providers={
            "android": FakePushProvider("android-provider", "android"),
            "ios": FakePushProvider("ios-provider", "ios", invalid_tokens=["ios-bad"]),
            "web": FakePushProvider("web-provider", "web"),
        },
        db=db,
        device_manager=device_manager,
        bulk_concurrency=5,
    )

    result = await service.send_push(
        SendPushParams(
            userId="user-1",
            title="Hello",
            body="World",
            metadata={"campaign": "spring"},
        )
    )

    notifications = get_records(db, "push_notifications")
    assert len(notifications) == 3
    assert str(result.id) == notifications[0]["id"]
    assert result.provider == "android-provider"
    assert result.sent_count == 2
    assert result.failed_count == 1
    assert result.metadata["campaign"] == "spring"
    assert result.metadata["notificationIds"] == [item["id"] for item in notifications]

    active_devices = await device_manager.get_active_devices("user-1")
    assert [device.token for device in active_devices] == ["android-good", "web-good"]


@pytest.mark.asyncio
async def test_push_service_preflights_all_platforms_before_sending() -> None:
    db = MemoryAdapter()
    device_manager = DeviceTokenManager(db)
    await device_manager.register_device(
        RegisterDeviceParams(userId="mixed-user", token="android-token", platform="android")
    )
    await device_manager.register_device(
        RegisterDeviceParams(userId="mixed-user", token="ios-token", platform="ios")
    )
    android_provider = FakePushProvider("android-provider", "android")
    service = PushService(
        providers={"android": android_provider},
        db=db,
        device_manager=device_manager,
    )

    with pytest.raises(SendfnError) as exc_info:
        await service.send_push(
            SendPushParams(userId="mixed-user", title="Hello", body="World")
        )

    assert str(exc_info.value) == "No push provider configured for platform ios"
    assert exc_info.value.retryable is False
    assert android_provider.send_calls == 0
    assert get_records(db, "push_notifications") == []


@pytest.mark.asyncio
async def test_push_service_honors_disabled_event_tracking() -> None:
    db = MemoryAdapter()
    device_manager = DeviceTokenManager(db)
    await device_manager.register_device(
        RegisterDeviceParams(userId="user-1", token="android-good", platform="android")
    )
    service = PushService(
        providers={"android": FakePushProvider("android-provider", "android")},
        db=db,
        device_manager=device_manager,
        event_tracking=False,
    )

    result = await service.send_push(
        SendPushParams(userId="user-1", title="Hello", body="World")
    )

    assert result.status == "sent"
    assert get_records(db, "communication_events") == []


@pytest.mark.asyncio
async def test_device_refresh_preserves_metadata_and_rejects_missing_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = MemoryAdapter()
    device_manager = DeviceTokenManager(db)
    await device_manager.register_device(
        RegisterDeviceParams(
            userId="user-123",
            token="old-token",
            platform="android",
            appVersion="1.0.0",
            deviceInfo={"model": "Pixel"},
        )
    )
    await device_manager.register_device(
        RegisterDeviceParams(
            userId="user-456",
            token="old-token",
            platform="android",
            appVersion="2.0.0",
        )
    )

    refreshed = await device_manager.refresh_device_token(
        "old-token",
        "new-token",
        "user-123",
        "android",
    )

    assert refreshed.token == "new-token"
    assert refreshed.app_version == "1.0.0"
    assert refreshed.device_info == {"model": "Pixel"}
    active_devices = await device_manager.get_active_devices("user-123", "android")
    assert [device.token for device in active_devices] == ["new-token"]
    other_user_devices = await device_manager.get_active_devices("user-456", "android")
    assert [device.token for device in other_user_devices] == ["old-token"]

    with pytest.raises(ValidationError) as exc_info:
        await device_manager.refresh_device_token(
            "missing-token",
            "other-token",
            "user-123",
            "android",
        )

    assert exc_info.value.code == "SENDFN_VALIDATION_ERROR"
    assert str(exc_info.value) == "Old device token was not found for the supplied user and platform"

    await device_manager.register_device(
        RegisterDeviceParams(
            userId="user-789",
            token="failing-old-token",
            platform="android",
        )
    )

    async def fail_register(_params: RegisterDeviceParams):
        raise SendfnError("refresh failed", code="SENDFN_PUSH_PROVIDER_ERROR", retryable=True)

    monkeypatch.setattr(device_manager, "register_device", fail_register)
    with pytest.raises(SendfnError) as refresh_error:
        await device_manager.refresh_device_token(
            "failing-old-token",
            "never-created-token",
            "user-789",
            "android",
        )

    assert refresh_error.value.code == "SENDFN_PUSH_PROVIDER_ERROR"
    still_active = await device_manager.get_active_devices("user-789", "android")
    assert [device.token for device in still_active] == ["failing-old-token"]


@pytest.mark.asyncio
async def test_re_registration_cleanup_and_bulk_push_are_bounded() -> None:
    db = MemoryAdapter()
    device_manager = DeviceTokenManager(db)
    first = await device_manager.register_device(
        RegisterDeviceParams(userId="user-1", token="dup-token", platform="android")
    )
    await device_manager.deactivate_tokens(["dup-token"])
    second = await device_manager.register_device(
        RegisterDeviceParams(userId="user-1", token="dup-token", platform="android")
    )

    assert str(first.id) == str(second.id)
    assert len(get_records(db, "device_tokens")) == 1

    await device_manager.deactivate_tokens(["dup-token"])
    removed = await device_manager.cleanup_inactive_devices(
        datetime.utcnow() + timedelta(seconds=1)
    )
    assert removed == 1
    assert get_records(db, "device_tokens") == []

    for index in range(20):
        await device_manager.register_device(
            RegisterDeviceParams(
                userId=f"bulk-user-{index}",
                token=f"bulk-token-{index}",
                platform="android",
            )
        )

    provider = FakePushProvider("android-provider", "android")
    service = PushService(
        providers={"android": provider},
        db=db,
        device_manager=device_manager,
        bulk_concurrency=5,
    )
    await service.send_bulk_push(
        [
          SendPushParams(userId=f"bulk-user-{index}", title="Hello", body="World")
          for index in range(20)
        ]
    )

    assert provider.observed_max_concurrency <= 5
    assert provider.observed_max_concurrency > 1
    assert_non_sequential(provider.observed_max_concurrency)
    with pytest.raises(SendfnError) as exc_info:
        assert_non_sequential(1)
    assert exc_info.value.code == "SENDFN_BULK_SEQUENTIAL_PATH"
    assert str(exc_info.value) == "Bulk send path is purely sequential"
