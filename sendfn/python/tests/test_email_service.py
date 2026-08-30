"""Email service regression tests."""

import base64
from datetime import datetime
from email import policy
from email.parser import Parser
from unittest.mock import AsyncMock

import pytest

from sendfn.database import helpers as db_helpers
from sendfn.database.memory import MemoryAdapter
from sendfn.email.aws_ses import AwsSesProvider
from sendfn.email.provider import (
    EmailProviderCapabilities,
    SendEmailRequest,
    SendEmailResponse,
)
from sendfn.email.service import EmailService
from sendfn.email.templates import TemplateEngine, TemplateRegistry
from sendfn.errors import EmailProviderError, SuppressionError, TemplateError, ValidationError
from sendfn.events.tracker import EventTracker
from sendfn.models import Attachment, AwsSesConfig, EmailConfig, SendEmailParams
from sendfn.suppression.manager import SuppressionManager


class MockEmailProvider:
    """Simple email provider stub for service tests."""

    def __init__(self) -> None:
        self.capabilities = EmailProviderCapabilities(
            supports_templates=True,
            supports_attachments=True,
            supports_bulk_send=True,
            supports_scheduling=False,
            max_recipients_per_email=50,
            max_attachment_size=10 * 1024 * 1024,
        )
        self.name = "mock-email"
        self.send_calls = 0
        self.responses: list[SendEmailResponse] = []

    async def initialize(self) -> None:
        return None

    async def send_email(self, request) -> SendEmailResponse:
        self.send_calls += 1
        if self.responses:
            return self.responses.pop(0)
        return SendEmailResponse(
            success=True,
            provider_message_id="msg-1",
            timestamp=datetime.utcnow(),
        )

    async def send_bulk_email(self, requests) -> list[SendEmailResponse]:
        return [await self.send_email(request) for request in requests]

    def validate_email(self, email: str) -> bool:
        return True

    async def is_healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


def create_service() -> tuple[EmailService, MockEmailProvider]:
    provider = MockEmailProvider()
    adapter = MemoryAdapter()
    service = EmailService(
        provider=provider,
        db=adapter,
        template_engine=TemplateEngine(),
        template_registry=TemplateRegistry(),
        suppression_manager=SuppressionManager(adapter),
        event_tracker=EventTracker(adapter),
        config=EmailConfig(fromEmail="noreply@example.com"),
        retry_attempts=3,
        retry_delay=0,
    )
    return service, provider


@pytest.mark.asyncio
async def test_suppression_short_circuits_before_provider_call() -> None:
    service, provider = create_service()

    await service.suppression_manager.add_to_suppression_list(
        email="user@example.com",
        reason="manual",
        source="manual",
    )

    with pytest.raises(SuppressionError) as exc_info:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert exc_info.value.code == "SENDFN_SUPPRESSED"
    assert str(exc_info.value) == "Recipient is suppressed"
    assert provider.send_calls == 0


@pytest.mark.asyncio
async def test_suppression_checks_cc_and_bcc_recipients() -> None:
    service, provider = create_service()
    for email in ["cc@example.com", "bcc@example.com"]:
        await service.suppression_manager.add_to_suppression_list(
            email=email,
            reason="manual",
            source="manual",
        )

    with pytest.raises(SuppressionError):
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="to@example.com",
                cc="cc@example.com",
                bcc="bcc@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )
    assert provider.send_calls == 0


@pytest.mark.asyncio
async def test_missing_template_and_empty_content_fail_with_stable_codes() -> None:
    service, provider = create_service()

    with pytest.raises(TemplateError) as missing_template:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                templateId="missing-template",
            )
        )

    assert missing_template.value.code == "SENDFN_TEMPLATE_NOT_FOUND"
    assert str(missing_template.value) == "Template `missing-template` was not found"

    with pytest.raises(ValidationError) as invalid_content:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
            )
        )

    assert invalid_content.value.code == "SENDFN_VALIDATION_ERROR"
    assert provider.send_calls == 0


@pytest.mark.asyncio
async def test_provider_limits_fail_before_network_call() -> None:
    service, provider = create_service()

    with pytest.raises(EmailProviderError) as recipient_limit:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to=[f"user{i}@example.com" for i in range(51)],
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert recipient_limit.value.code == "SENDFN_PROVIDER_LIMIT"

    with pytest.raises(EmailProviderError) as attachment_limit:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
                attachments=[
                    Attachment(
                        filename="big.bin",
                        content=b"x" * (11 * 1024 * 1024),
                    )
                ],
            )
        )

    assert attachment_limit.value.code == "SENDFN_PROVIDER_LIMIT"
    assert provider.send_calls == 0

    provider.capabilities.max_attachment_size = 10
    await service.send_email(
        SendEmailParams(
            userId="user-1",
            to="user@example.com",
            subject="Hello",
            html="<p>Hello</p>",
            attachments=[
                Attachment(
                    filename="encoded.bin",
                    content=base64.b64encode(b"x" * 9).decode("ascii"),
                    encoding="base64",
                )
            ],
        )
    )
    assert provider.send_calls == 1


@pytest.mark.asyncio
async def test_accepted_delivery_is_not_marked_failed_when_persistence_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, provider = create_service()
    update = AsyncMock(side_effect=RuntimeError("database unavailable"))
    monkeypatch.setattr(db_helpers, "update_email_transaction", update)

    with pytest.raises(RuntimeError, match="database unavailable"):
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert provider.send_calls == 1
    assert update.await_count == 1
    assert update.await_args.args[2]["status"] == "sent"


@pytest.mark.asyncio
async def test_retry_behavior_is_bounded_and_non_retryable_errors_do_not_retry() -> None:
    service, provider = create_service()
    provider.responses = [
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "Throttling", "message": "slow down", "retryable": True},
        ),
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "Throttling", "message": "slow down", "retryable": True},
        ),
        SendEmailResponse(
            success=True,
            provider_message_id="ses-123",
            timestamp=datetime.utcnow(),
        ),
    ]

    transaction = await service.send_email(
        SendEmailParams(
            userId="user-1",
            to="user@example.com",
            subject="Hello",
            html="<p>Hello</p>",
        )
    )

    assert provider.send_calls == 3
    assert transaction.provider_message_id == "ses-123"

    provider.send_calls = 0
    provider.responses = [
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "BadRequest", "message": "nope", "retryable": False},
        )
    ]

    with pytest.raises(EmailProviderError) as non_retryable:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert non_retryable.value.code == "BadRequest"
    assert provider.send_calls == 1


@pytest.mark.asyncio
async def test_retry_exhaustion_uses_stable_code() -> None:
    service, provider = create_service()
    provider.responses = [
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "Throttling", "message": "slow down", "retryable": True},
        ),
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "Throttling", "message": "slow down", "retryable": True},
        ),
        SendEmailResponse(
            success=False,
            timestamp=datetime.utcnow(),
            error={"code": "Throttling", "message": "slow down", "retryable": True},
        ),
    ]

    with pytest.raises(EmailProviderError) as exhausted:
        await service.send_email(
            SendEmailParams(
                userId="user-1",
                to="user@example.com",
                subject="Hello",
                html="<p>Hello</p>",
            )
        )

    assert exhausted.value.code == "SENDFN_PROVIDER_RETRY_EXHAUSTED"
    assert str(exhausted.value) == "Email provider retry limit exhausted"
    assert provider.send_calls == 3


def test_aws_ses_provider_uses_boto_error_codes_when_present() -> None:
    """SES provider error mapping should prefer AWS response codes over Python class names."""
    provider = AwsSesProvider(
        AwsSesConfig(
            accessKeyId="key",
            secretAccessKey="secret",
            region="us-east-1",
        )
    )

    class FakeClientError(Exception):
        def __init__(self, code: str) -> None:
            super().__init__(code)
            self.response = {"Error": {"Code": code}}

    rejected = FakeClientError("MessageRejected")
    throttled = FakeClientError("ThrottlingException")

    assert provider._error_code(rejected) == "MessageRejected"
    assert provider._is_retryable_error(rejected) is False
    assert provider._error_code(throttled) == "THROTTLING"
    assert provider._is_retryable_error(throttled) is True


@pytest.mark.asyncio
async def test_aws_ses_decodes_string_attachments_and_forwards_tags() -> None:
    provider = AwsSesProvider(
        AwsSesConfig(accessKeyId="key", secretAccessKey="secret", region="us-east-1")
    )

    class FakeClient:
        def __init__(self) -> None:
            self.simple_kwargs = None
            self.raw_kwargs = None

        def send_email(self, **kwargs):
            self.simple_kwargs = kwargs
            return {"MessageId": "simple"}

        def send_raw_email(self, **kwargs):
            self.raw_kwargs = kwargs
            return {"MessageId": "raw"}

    client = FakeClient()
    provider._client = client
    tags = {"campaign": "launch", "userId": "user-1"}
    simple = SendEmailRequest(
        from_email="from@example.com", to=["to@example.com"], subject="Simple",
        html="<p>Simple</p>", tags=tags,
    )
    await provider._send_simple_email(simple)
    assert client.simple_kwargs["Tags"] == [
        {"Name": "campaign", "Value": "launch"},
        {"Name": "userId", "Value": "user-1"},
    ]

    payload = b"binary\x00payload"
    raw = SendEmailRequest(
        from_email="from@example.com", to=["to@example.com"], subject="Raw",
        html="<p>Raw</p>", tags=tags,
        attachments=[Attachment(filename="payload.bin", content=base64.b64encode(payload).decode(), encoding="base64")],
    )
    await provider._send_raw_email(raw)
    message = Parser(policy=policy.default).parsestr(client.raw_kwargs["RawMessage"]["Data"])
    attachment = next(message.iter_attachments())
    assert attachment.get_payload(decode=True) == payload
    assert client.raw_kwargs["Tags"] == client.simple_kwargs["Tags"]
