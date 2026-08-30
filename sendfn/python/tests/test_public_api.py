"""Public API parity tests for sendfn."""

from datetime import datetime, timedelta

import pytest

from sendfn import (
    AwsSesConfig,
    EmailConfig,
    EmailProviderError,
    RegisterDeviceParams,
    SendEmailParams,
    Sendfn,
    SendfnConfig,
    ValidationError,
)
from sendfn.database.memory import MemoryAdapter


class TrackingMemoryAdapter(MemoryAdapter):
    """Memory adapter that tracks close calls for lifecycle assertions."""

    def __init__(self) -> None:
        super().__init__()
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1
        await super().close()


@pytest.mark.asyncio
async def test_public_api_surface_and_helpers() -> None:
    """The Python SDK should expose the same phase-1 surface and helper flows."""
    client = Sendfn(
        SendfnConfig(
            database=TrackingMemoryAdapter(),
            aws_sns_topic_arns=["arn:aws:sns:us-east-1:123456789012:sendfn"],
        )
    )

    expected_methods = [
        "send_email",
        "send_bulk_email",
        "send_sms",
        "send_push",
        "send_bulk_push",
        "register_device",
        "get_devices",
        "deactivate_device",
        "refresh_device_token",
        "cleanup_inactive_devices",
        "register_template",
        "get_template",
        "list_templates",
        "get_email_events",
        "get_push_events",
        "get_sms_events",
        "query_events",
        "check_suppression_list",
        "add_to_suppression_list",
        "bulk_add_to_suppression_list",
        "export_suppression_list",
        "remove_from_suppression_list",
        "get_webhook_handlers",
        "close",
    ]

    for method_name in expected_methods:
        assert hasattr(client, method_name)

    await client.register_device(
        RegisterDeviceParams(userId="user-1", token="old-token", platform="android")
    )
    refreshed = await client.refresh_device_token(
        "old-token",
        "new-token",
        "user-1",
        "android",
    )
    assert refreshed.token == "new-token"

    active_devices = await client.get_devices("user-1")
    assert [device.token for device in active_devices] == ["new-token"]

    removed = await client.cleanup_inactive_devices(datetime.utcnow() + timedelta(seconds=1))
    assert removed == 1

    await client.bulk_add_to_suppression_list(
        [
            {"email": "one@example.com", "reason": "manual", "source": "manual"},
            {"email": "two@example.com", "reason": "bounce", "source": "aws-ses"},
        ]
    )
    exported = await client.export_suppression_list()
    assert len(exported) == 2

    assert list(client.get_webhook_handlers().keys()) == ["awsSes"]


@pytest.mark.asyncio
async def test_typed_errors_and_close_are_idempotent() -> None:
    """Missing providers should raise typed errors and close should be idempotent."""
    adapter = TrackingMemoryAdapter()
    client = Sendfn(SendfnConfig(database=adapter))

    with pytest.raises(ValidationError, match="aws_sns_topic_arns"):
        client.get_webhook_handlers()

    with pytest.raises(EmailProviderError) as exc_info:
        await client.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert exc_info.value.code == "SENDFN_EMAIL_PROVIDER_ERROR"
    assert exc_info.value.retryable is True

    await client.close()
    await client.close()
    assert adapter.close_calls == 1


def test_template_registry_exists_before_email_service_init(monkeypatch: pytest.MonkeyPatch) -> None:
    """Email service initialization should run after the template registry exists."""
    observed: dict[str, bool] = {}

    def fake_initialize_email_service(self: Sendfn, email_config: EmailConfig) -> None:
        observed["has_template_registry"] = hasattr(self, "template_registry")
        self.email_service = object()

    monkeypatch.setattr(Sendfn, "_initialize_email_service", fake_initialize_email_service)

    Sendfn(
        SendfnConfig(
            database=TrackingMemoryAdapter(),
            email=EmailConfig(
                fromEmail="noreply@example.com",
                awsSes=AwsSesConfig(
                    accessKeyId="key",
                    secretAccessKey="secret",
                    region="us-east-1",
                ),
            ),
        )
    )

    assert observed["has_template_registry"] is True
