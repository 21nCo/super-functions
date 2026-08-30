"""SMS service event-tracking coverage."""

from datetime import datetime
from typing import Any

import pytest

from sendfn.database.memory import MemoryAdapter
from sendfn.models import SendSmsParams
from sendfn.sms.provider import SendSmsRequest, SendSmsResponse, SmsProviderCapabilities
from sendfn.sms.service import SmsService


class FakeSmsProvider:
    def __init__(self) -> None:
        self.initialize_calls = 0
        self.send_calls = 0

    @property
    def name(self) -> str:
        return "fake-sms"

    @property
    def capabilities(self) -> SmsProviderCapabilities:
        return SmsProviderCapabilities()

    async def initialize(self) -> None:
        self.initialize_calls += 1

    async def send_sms(self, request: SendSmsRequest) -> SendSmsResponse:
        self.send_calls += 1
        return SendSmsResponse(
            success=True,
            provider_message_id=f"sent:{request.to}",
            timestamp=datetime(2026, 4, 5),
        )

    async def is_healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class FailingPostSendStore(MemoryAdapter):
    def __init__(self) -> None:
        super().__init__()
        self.sms_update_attempts = 0

    async def update(self, params: Any) -> dict[str, Any]:
        if params.model == "sms_transactions":
            self.sms_update_attempts += 1
            if self.sms_update_attempts == 1:
                raise RuntimeError("persistence unavailable after provider acceptance")
        return await super().update(params)


def get_records(db: MemoryAdapter, model: str) -> list[dict[str, Any]]:
    return list(db._storage.get(model, {}).values())


@pytest.mark.asyncio
async def test_sms_service_honors_disabled_event_tracking() -> None:
    db = MemoryAdapter()
    provider = FakeSmsProvider()
    service = SmsService(provider, db, event_tracking=False)

    result = await service.send_sms(SendSmsParams(userId="user-1", to="+15551234567", message="Hello"))
    await service.send_sms(SendSmsParams(userId="user-1", to="+15551234568", message="Again"))

    assert result.status == "sent"
    assert provider.initialize_calls == 1
    assert get_records(db, "communication_events") == []


@pytest.mark.asyncio
async def test_sms_service_does_not_reclassify_accepted_delivery_when_persistence_fails() -> None:
    db = FailingPostSendStore()
    provider = FakeSmsProvider()
    service = SmsService(provider, db)

    with pytest.raises(RuntimeError, match="persistence unavailable"):
        await service.send_sms(SendSmsParams(userId="user-1", to="+15551234567", message="Hello"))

    assert provider.send_calls == 1
    assert db.sms_update_attempts == 1
    assert get_records(db, "sms_transactions")[0]["status"] == "pending"
    assert get_records(db, "communication_events") == []
