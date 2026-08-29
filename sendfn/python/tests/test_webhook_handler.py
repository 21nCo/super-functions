"""Webhook verification and correlation regression tests for phase 4."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import pytest

from sendfn.database.helpers import create_email_transaction, get_suppression_list_entry
from sendfn.database.memory import MemoryAdapter
from sendfn.errors import SendfnError
from sendfn.events.aws_sns_verifier import AwsSnsVerifier
from sendfn.events.webhook_handler import AwsSesWebhookHandler
from sendfn.suppression.manager import SuppressionManager


class CaptureLogger:
    """Collect structured log extras for assertions."""

    def __init__(self) -> None:
        self.infos: list[dict[str, Any]] = []
        self.warnings: list[dict[str, Any]] = []

    def info(self, _message: str, *, extra: dict[str, Any]) -> None:
        self.infos.append(extra)

    def warning(self, _message: str, *, extra: dict[str, Any]) -> None:
        self.warnings.append(extra)


class FakeVerifier:
    """Programmable async verifier used by webhook tests."""

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def verify(self, _message: dict[str, Any]) -> None:
        if self.error is not None:
            raise self.error


def create_envelope(
    message: dict[str, Any],
    **overrides: Any,
) -> dict[str, Any]:
    envelope = {
        "Type": "Notification",
        "MessageId": "sns-1",
        "TopicArn": "arn:aws:sns:us-east-1:123456789012:sendfn",
        "Timestamp": "2026-04-02T00:00:00Z",
        "SignatureVersion": "1",
        "Signature": "valid",
        "SigningCertURL": "https://sns.us-east-1.amazonaws.com/cert.pem",
        "Message": json.dumps(message),
    }
    envelope.update(overrides)
    return envelope


async def seed_email_transaction(db: MemoryAdapter, **overrides: Any) -> None:
    await create_email_transaction(
        db,
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "userId": "user-1",
            "to": "user@example.com",
            "from": "noreply@example.com",
            "subject": "Hello",
            "templateId": None,
            "templateData": None,
            "provider": "aws-ses",
            "providerMessageId": "ses-123",
            "status": "sent",
            "sentAt": datetime(2026, 4, 2, 0, 0, 0, tzinfo=timezone.utc),
            "deliveredAt": None,
            "bouncedAt": None,
            "complainedAt": None,
            "metadata": {},
            **overrides,
        },
    )


def get_records(db: MemoryAdapter, model: str) -> list[dict[str, Any]]:
    return list(db._get_or_create_storage(model).values())


def clear_model(db: MemoryAdapter, model: str) -> None:
    db._get_or_create_storage(model).clear()


@pytest.mark.asyncio
async def test_invalid_signature_rejects_before_mutation_and_logs_structured_metadata(
    caplog: pytest.LogCaptureFixture,
) -> None:
    db = MemoryAdapter()
    await seed_email_transaction(db)
    handler = AwsSesWebhookHandler(
        db,
        SuppressionManager(db),
        verifier=FakeVerifier(
            SendfnError(
                "SNS signature verification failed",
                code="SENDFN_WEBHOOK_SIGNATURE_INVALID",
                retryable=False,
            )
        ),
    )

    with pytest.raises(SendfnError) as exc_info:
        await handler.handle_webhook(
            create_envelope(
                {
                    "notificationType": "Delivery",
                    "mail": {
                        "messageId": "ses-123",
                        "timestamp": "2026-04-02T00:00:00Z",
                    },
                    "delivery": {
                        "timestamp": "2026-04-02T00:00:05Z",
                        "recipients": ["user@example.com"],
                    },
                },
                MessageId="sns-invalid",
                Signature="invalid",
            ),
            request_id="req_invalid",
        )

    assert exc_info.value.code == "SENDFN_WEBHOOK_SIGNATURE_INVALID"
    assert get_records(db, "communication_events") == []
    assert get_records(db, "suppression_list") == []
    assert get_records(db, "email_transactions")[0]["status"] == "sent"
    warning_records = [record for record in caplog.records if record.name == "sendfn.webhook"]
    assert len(warning_records) == 1
    warning = warning_records[0]
    assert warning.request_id == "req_invalid"
    assert warning.operation == "webhook.process"
    assert warning.provider == "aws-ses"
    assert warning.sns_message_id == "sns-invalid"
    assert warning.status == "rejected"
    assert warning.verification_result == "invalid-signature"
    assert warning.matched_transactions == 0
    assert warning.orphan_events == 0
    assert warning.created_suppression_entries == 0
    assert warning.error_code == "SENDFN_WEBHOOK_SIGNATURE_INVALID"
    assert "Signature" not in warning.__dict__
    assert "Message" not in warning.__dict__
    assert "deviceToken" not in warning.__dict__


@pytest.mark.asyncio
async def test_verifier_rejects_invalid_hosts_stale_timestamps_and_malformed_envelopes() -> None:
    verifier = AwsSnsVerifier(
        now=lambda: datetime(2026, 4, 2, 0, 0, 0, tzinfo=timezone.utc),
        fetch_certificate=lambda _url: "certificate",
        verify_signature=lambda *_args: True,
        topic_arns=["arn:aws:sns:us-east-1:123456789012:sendfn"],
        max_age_seconds=5 * 60,
    )
    stale_verifier = AwsSnsVerifier(
        now=lambda: datetime(2026, 4, 2, 0, 10, 0, tzinfo=timezone.utc),
        fetch_certificate=lambda _url: "certificate",
        verify_signature=lambda *_args: True,
        topic_arns=["arn:aws:sns:us-east-1:123456789012:sendfn"],
        max_age_seconds=5 * 60,
    )

    with pytest.raises(SendfnError) as invalid_host:
        await verifier.verify(
            create_envelope(
                {
                    "notificationType": "Delivery",
                    "mail": {"messageId": "ses-123", "timestamp": "2026-04-02T00:00:00Z"},
                    "delivery": {
                        "timestamp": "2026-04-02T00:00:05Z",
                        "recipients": ["user@example.com"],
                    },
                },
                SigningCertURL="https://example.com/cert.pem",
            )
        )

    assert invalid_host.value.code == "SENDFN_WEBHOOK_SIGNATURE_INVALID"

    with pytest.raises(SendfnError) as stale:
        await stale_verifier.verify(
            create_envelope(
                {
                    "notificationType": "Delivery",
                    "mail": {"messageId": "ses-123", "timestamp": "2026-04-02T00:00:00Z"},
                    "delivery": {
                        "timestamp": "2026-04-02T00:00:05Z",
                        "recipients": ["user@example.com"],
                    },
                },
                Timestamp="2026-04-01T23:50:00Z",
            )
        )

    assert stale.value.code == "SENDFN_WEBHOOK_MESSAGE_INVALID"

    with pytest.raises(SendfnError) as malformed:
        await verifier.verify(
            {
                "Type": "Notification",
                "Timestamp": "2026-04-02T00:00:00Z",
                "SignatureVersion": "1",
                "Signature": "valid",
                "SigningCertURL": "https://sns.us-east-1.amazonaws.com/cert.pem",
            }
        )

    assert malformed.value.code == "SENDFN_WEBHOOK_MESSAGE_INVALID"

    canonical_messages: list[str] = []
    topic_verifier = AwsSnsVerifier(
        fetch_certificate=lambda _url: "certificate",
        verify_signature=lambda canonical, *_args: canonical_messages.append(canonical) or True,
        topic_arns=["arn:aws:sns:us-east-1:123456789012:sendfn"],
    )
    await topic_verifier.verify(create_envelope({"notificationType": "Delivery"}))
    assert canonical_messages[0].endswith(
        "TopicArn\narn:aws:sns:us-east-1:123456789012:sendfn\nType\nNotification\n"
    )
    with pytest.raises(SendfnError) as untrusted_topic:
        await topic_verifier.verify(
            create_envelope(
                {"notificationType": "Delivery"},
                TopicArn="arn:aws:sns:us-east-1:123456789012:other",
            )
        )
    assert untrusted_topic.value.code == "SENDFN_WEBHOOK_MESSAGE_INVALID"


@pytest.mark.asyncio
async def test_delivery_updates_matching_transaction_and_keeps_duplicates_idempotent() -> None:
    db = MemoryAdapter()
    await seed_email_transaction(db)
    handler = AwsSesWebhookHandler(db, SuppressionManager(db), verifier=FakeVerifier())

    envelope = create_envelope(
        {
            "notificationType": "Delivery",
            "mail": {
                "messageId": "ses-123",
                "timestamp": "2026-04-02T00:00:00Z",
                "destination": ["user@example.com"],
            },
            "delivery": {
                "timestamp": "2026-04-02T00:00:05Z",
                "recipients": ["user@example.com"],
                "processingTimeMillis": 100,
                "smtpResponse": "250 ok",
            },
        }
    )

    first = await handler.handle_webhook(envelope)
    second = await handler.handle_webhook(envelope)

    assert first == {
        "accepted": True,
        "verified": True,
        "matchedTransactions": 1,
        "createdSuppressionEntries": 0,
        "orphanEvents": 0,
    }
    assert second == first
    assert get_records(db, "email_transactions")[0]["status"] == "delivered"
    assert len(get_records(db, "communication_events")) == 1
    assert get_records(db, "communication_events")[0]["referenceId"] == "00000000-0000-4000-8000-000000000001"


@pytest.mark.asyncio
async def test_bounce_and_complaint_update_state_suppression_and_duplicate_terminal_events() -> None:
    db = MemoryAdapter()
    await seed_email_transaction(db)
    handler = AwsSesWebhookHandler(db, SuppressionManager(db), verifier=FakeVerifier())

    bounce = await handler.handle_webhook(
        create_envelope(
            {
                "notificationType": "Bounce",
                "mail": {
                    "messageId": "ses-123",
                    "timestamp": "2026-04-02T00:00:00Z",
                    "destination": ["user@example.com"],
                },
                "bounce": {
                    "timestamp": "2026-04-02T00:00:07Z",
                    "feedbackId": "fb-1",
                    "bounceType": "Permanent",
                    "bounceSubType": "General",
                    "bouncedRecipients": [
                        {
                            "emailAddress": "user@example.com",
                            "diagnosticCode": "550",
                        }
                    ],
                },
            }
        )
    )

    assert bounce["matchedTransactions"] == 1
    assert bounce["createdSuppressionEntries"] == 1
    assert get_records(db, "email_transactions")[0]["status"] == "bounced"
    assert get_records(db, "communication_events")[0]["eventTimestamp"] == datetime(
        2026, 4, 2, 0, 0, 7, tzinfo=timezone.utc
    )
    bounce_suppression = await get_suppression_list_entry(db, "user@example.com")
    assert bounce_suppression is not None
    assert bounce_suppression.reason == "bounce"

    get_records(db, "email_transactions")[0]["status"] = "delivered"
    get_records(db, "email_transactions")[0]["bouncedAt"] = None
    clear_model(db, "communication_events")
    clear_model(db, "suppression_list")

    complaint_envelope = create_envelope(
        {
            "notificationType": "Complaint",
            "mail": {
                "messageId": "ses-123",
                "timestamp": "2026-04-02T00:00:00Z",
                "destination": ["user@example.com"],
            },
            "complaint": {
                "timestamp": "2026-04-02T00:00:09Z",
                "feedbackId": "cp-1",
                "complaintFeedbackType": "abuse",
                "complaintSubType": "OnAccountSuppressionList",
                "userAgent": "Amazon SES",
                "complainedRecipients": [{"emailAddress": "user@example.com"}],
            },
        },
        MessageId="sns-complaint",
    )

    first = await handler.handle_webhook(complaint_envelope)
    second = await handler.handle_webhook(complaint_envelope)

    assert first["matchedTransactions"] == 1
    assert first["createdSuppressionEntries"] == 1
    assert second["matchedTransactions"] == 1
    assert second["createdSuppressionEntries"] == 0
    assert get_records(db, "email_transactions")[0]["status"] == "complained"
    assert len(get_records(db, "communication_events")) == 1
    complaint_suppression = await get_suppression_list_entry(db, "user@example.com")
    assert complaint_suppression is not None
    assert complaint_suppression.reason == "complaint"


@pytest.mark.asyncio
async def test_unmatched_complaints_use_deterministic_orphan_references() -> None:
    db = MemoryAdapter()
    handler = AwsSesWebhookHandler(db, SuppressionManager(db), verifier=FakeVerifier())

    result = await handler.handle_webhook(
        create_envelope(
            {
                "notificationType": "Complaint",
                "mail": {
                    "messageId": "ses-missing",
                    "timestamp": "2026-04-02T00:00:00Z",
                    "destination": ["user@example.com"],
                },
                "complaint": {
                    "complainedRecipients": [{"emailAddress": "user@example.com"}],
                },
            },
            MessageId="sns-orphan",
        )
    )

    assert result == {
        "accepted": True,
        "verified": True,
        "matchedTransactions": 0,
        "createdSuppressionEntries": 1,
        "orphanEvents": 1,
    }
    event = get_records(db, "communication_events")[0]
    assert event["referenceId"] == "provider:aws-ses:ses-missing"
    assert event["metadata"]["orphaned"] is True
    assert event["metadata"]["providerMessageId"] == "ses-missing"
    suppression = await get_suppression_list_entry(db, "user@example.com")
    assert suppression is not None
    assert suppression.reason == "complaint"
