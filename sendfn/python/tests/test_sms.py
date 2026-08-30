"""SMS service event-tracking coverage."""

from datetime import datetime
from typing import Any

import pytest

from sendfn.database.memory import MemoryAdapter
from sendfn.models import SendSmsParams
from sendfn.sms.provider import SendSmsRequest, SendSmsResponse, SmsProviderCapabilities
from sendfn.sms.service import SmsService


class FakeSmsProvider:
    @property
    def name(self) -> str:
        return "fake-sms"

    @property
    def capabilities(self) -> SmsProviderCapabilities:
        return SmsProviderCapabilities()

    async def initialize(self) -> None:
        return None

    async def send_sms(self, request: SendSmsRequest) -> SendSmsResponse:
        return SendSmsResponse(
            success=True,
            provider_message_id=f"sent:{request.to}",
            timestamp=datetime(2026, 4, 5),
        )

    async def is_healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


def get_records(db: MemoryAdapter, model: str) -> list[dict[str, Any]]:
    return list(db._storage.get(model, {}).values())


@pytest.mark.asyncio
async def test_sms_service_honors_disabled_event_tracking() -> None:
    db = MemoryAdapter()
    service = SmsService(FakeSmsProvider(), db, event_tracking=False)

    result = await service.send_sms(SendSmsParams(userId="user-1", to="+15551234567", message="Hello"))

    assert result.status == "sent"
    assert get_records(db, "communication_events") == []
