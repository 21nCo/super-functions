"""AWS SES webhook handler for processing verified SES notifications."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Optional, cast
from uuid import uuid4

from superfunctions.db import Adapter

from ..database.helpers import (
    get_email_transaction_by_provider_message_id,
    get_events_by_reference,
    record_event,
    update_email_transaction,
)
from ..errors import SendfnError
from ..models import CommunicationEvent, EmailTransaction
from ..suppression.manager import SuppressionManager
from .aws_sns_verifier import AwsSnsVerifier, create_webhook_error

logger = logging.getLogger("sendfn.webhook")


def _create_request_id() -> str:
    return f"req_{uuid4().hex[:12]}"


def _parse_timestamp(timestamp: Optional[str]) -> datetime:
    normalized = (timestamp or "").replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise create_webhook_error(
            "SENDFN_WEBHOOK_MESSAGE_INVALID",
            "SNS message is malformed",
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _create_orphan_reference_id(provider_message_id: str) -> str:
    return f"provider:aws-ses:{provider_message_id}"


def _is_terminal_status(status: str) -> bool:
    return status in {"bounced", "complained", "failed"}


def _is_duplicate_event(
    event: CommunicationEvent,
    *,
    provider_message_id: str,
    recipient_email: Optional[str],
    event_type: str,
) -> bool:
    return (
        event.event_type == event_type
        and event.provider == "aws-ses"
        and event.recipient_email == recipient_email
        and event.metadata.get("providerMessageId") == provider_message_id
    )


class AwsSesWebhookHandler:
    """Handler for AWS SES SNS webhook notifications."""

    def __init__(
        self,
        db: Adapter,
        suppression_manager: SuppressionManager,
        *,
        verifier: Optional[AwsSnsVerifier] = None,
        now: Optional[Callable[[], datetime]] = None,
    ) -> None:
        self.db = db
        self.suppression_manager = suppression_manager
        self.verifier = verifier or AwsSnsVerifier()
        self.now = now or (lambda: datetime.now(timezone.utc))

    async def handle_webhook(
        self,
        sns_message: dict[str, Any],
        *,
        request_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Verify and process an SNS envelope."""
        resolved_request_id = request_id or _create_request_id()
        sns_message_id = sns_message.get("MessageId")

        try:
            await self.verifier.verify(sns_message)
            event = self._parse_ses_event(sns_message["Message"])
            result = await self._process_event(event)
        except Exception as exc:
            sendfn_error = (
                exc if isinstance(exc, SendfnError) else create_webhook_error("SENDFN_INTERNAL_ERROR", "Unexpected webhook failure")
            )
            logger.warning(
                "sendfn webhook rejected",
                extra={
                    "request_id": resolved_request_id,
                    "operation": "webhook.process",
                    "provider": "aws-ses",
                    "sns_message_id": sns_message_id,
                    "status": "rejected",
                    "verification_result": "invalid-signature"
                    if sendfn_error.code == "SENDFN_WEBHOOK_SIGNATURE_INVALID"
                    else "invalid-message",
                    "matched_transactions": 0,
                    "orphan_events": 0,
                    "created_suppression_entries": 0,
                    "error_code": sendfn_error.code,
                },
            )
            if exc is sendfn_error:
                raise
            raise sendfn_error from exc

        logger.info(
            "sendfn webhook accepted",
            extra={
                "request_id": resolved_request_id,
                "operation": "webhook.process",
                "provider": "aws-ses",
                "sns_message_id": sns_message_id,
                "status": "accepted",
                "verification_result": "verified",
                "matched_transactions": result["matchedTransactions"],
                "orphan_events": result["orphanEvents"],
                "created_suppression_entries": result["createdSuppressionEntries"],
            },
        )
        return result

    def _parse_ses_event(self, raw_message: str) -> dict[str, Any]:
        try:
            event = json.loads(raw_message)
        except json.JSONDecodeError as exc:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            ) from exc

        mail = event.get("mail") or {}
        if not event.get("notificationType") or not mail.get("messageId") or not mail.get("timestamp"):
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )
        return cast(dict[str, Any], event)

    async def _process_event(self, event: dict[str, Any]) -> dict[str, Any]:
        notification_type = event["notificationType"]
        if notification_type == "Bounce":
            return await self._handle_bounce(event)
        if notification_type == "Complaint":
            return await self._handle_complaint(event)
        if notification_type == "Delivery":
            return await self._handle_delivery(event)

        raise create_webhook_error(
            "SENDFN_WEBHOOK_MESSAGE_INVALID",
            "SNS message is malformed",
        )

    async def _handle_bounce(self, event: dict[str, Any]) -> dict[str, Any]:
        bounce = event.get("bounce") or {}
        recipients = bounce.get("bouncedRecipients") or []
        if not recipients:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

        provider_message_id = event["mail"]["messageId"]
        transaction = await get_email_transaction_by_provider_message_id(self.db, provider_message_id)
        reference_id = transaction.id if transaction else _create_orphan_reference_id(provider_message_id)
        existing_events = await get_events_by_reference(self.db, str(reference_id), "email")
        created_suppression_entries = 0
        event_timestamp = _parse_timestamp(bounce.get("timestamp") or event["mail"]["timestamp"])

        for recipient in recipients:
            email = recipient.get("emailAddress")
            if not email:
                continue

            if not any(
                _is_duplicate_event(
                    existing_event,
                    provider_message_id=provider_message_id,
                    recipient_email=email,
                    event_type="bounced",
                )
                for existing_event in existing_events
            ):
                await record_event(
                    self.db,
                    {
                        "referenceId": str(reference_id),
                        "referenceType": "email",
                        "eventType": "bounced",
                        "provider": "aws-ses",
                        "providerEventId": bounce.get("feedbackId") or provider_message_id,
                        "recipientEmail": email,
                        "recipientPhone": None,
                        "deviceToken": None,
                        "metadata": {
                            "providerMessageId": provider_message_id,
                            "orphaned": transaction is None,
                            "bounceType": bounce.get("bounceType"),
                            "bounceSubType": bounce.get("bounceSubType"),
                            "diagnosticCode": recipient.get("diagnosticCode"),
                        },
                        "eventTimestamp": event_timestamp,
                    },
                )

            if (bounce.get("bounceType") or "").lower() == "permanent":
                was_suppressed = await self.suppression_manager.is_suppressed(email)
                await self.suppression_manager.add_to_suppression_list(
                    email=email,
                    reason="bounce",
                    source="aws-ses",
                    bounce_type=bounce.get("bounceType"),
                    metadata={
                        "providerMessageId": provider_message_id,
                        "bounceSubType": bounce.get("bounceSubType"),
                        "diagnosticCode": recipient.get("diagnosticCode"),
                    },
                )
                if not was_suppressed:
                    created_suppression_entries += 1

        if transaction is not None:
            await self._apply_lifecycle_transition(
                transaction, "bounced", event_timestamp
            )

        return {
            "accepted": True,
            "verified": True,
            "matchedTransactions": 1 if transaction else 0,
            "createdSuppressionEntries": created_suppression_entries,
            "orphanEvents": 0 if transaction else 1,
        }

    async def _handle_complaint(self, event: dict[str, Any]) -> dict[str, Any]:
        complaint = event.get("complaint") or {}
        recipients = complaint.get("complainedRecipients") or []
        if not recipients:
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

        provider_message_id = event["mail"]["messageId"]
        transaction = await get_email_transaction_by_provider_message_id(self.db, provider_message_id)
        reference_id = transaction.id if transaction else _create_orphan_reference_id(provider_message_id)
        existing_events = await get_events_by_reference(self.db, str(reference_id), "email")
        created_suppression_entries = 0
        event_timestamp = _parse_timestamp(
            complaint.get("timestamp") or event["mail"]["timestamp"]
        )

        for recipient in recipients:
            email = recipient.get("emailAddress")
            if not email:
                continue

            if not any(
                _is_duplicate_event(
                    existing_event,
                    provider_message_id=provider_message_id,
                    recipient_email=email,
                    event_type="complained",
                )
                for existing_event in existing_events
            ):
                await record_event(
                    self.db,
                    {
                        "referenceId": str(reference_id),
                        "referenceType": "email",
                        "eventType": "complained",
                        "provider": "aws-ses",
                        "providerEventId": complaint.get("feedbackId") or provider_message_id,
                        "recipientEmail": email,
                        "recipientPhone": None,
                        "deviceToken": None,
                        "metadata": {
                            "providerMessageId": provider_message_id,
                            "orphaned": transaction is None,
                            "complaintFeedbackType": complaint.get("complaintFeedbackType"),
                            "complaintSubType": complaint.get("complaintSubType"),
                        },
                        "eventTimestamp": event_timestamp,
                    },
                )

            was_suppressed = await self.suppression_manager.is_suppressed(email)
            await self.suppression_manager.add_to_suppression_list(
                email=email,
                reason="complaint",
                source="aws-ses",
                metadata={
                    "providerMessageId": provider_message_id,
                    "complaintFeedbackType": complaint.get("complaintFeedbackType"),
                    "complaintSubType": complaint.get("complaintSubType"),
                    "userAgent": complaint.get("userAgent"),
                },
            )
            if not was_suppressed:
                created_suppression_entries += 1

        if transaction is not None:
            await self._apply_lifecycle_transition(
                transaction, "complained", event_timestamp
            )

        return {
            "accepted": True,
            "verified": True,
            "matchedTransactions": 1 if transaction else 0,
            "createdSuppressionEntries": created_suppression_entries,
            "orphanEvents": 0 if transaction else 1,
        }

    async def _handle_delivery(self, event: dict[str, Any]) -> dict[str, Any]:
        delivery = event.get("delivery") or {}
        recipients = delivery.get("recipients") or []
        if not recipients or not delivery.get("timestamp"):
            raise create_webhook_error(
                "SENDFN_WEBHOOK_MESSAGE_INVALID",
                "SNS message is malformed",
            )

        provider_message_id = event["mail"]["messageId"]
        transaction = await get_email_transaction_by_provider_message_id(self.db, provider_message_id)
        reference_id = transaction.id if transaction else _create_orphan_reference_id(provider_message_id)
        existing_events = await get_events_by_reference(self.db, str(reference_id), "email")

        for email in recipients:
            if not any(
                _is_duplicate_event(
                    existing_event,
                    provider_message_id=provider_message_id,
                    recipient_email=email,
                    event_type="delivered",
                )
                for existing_event in existing_events
            ):
                await record_event(
                    self.db,
                    {
                        "referenceId": str(reference_id),
                        "referenceType": "email",
                        "eventType": "delivered",
                        "provider": "aws-ses",
                        "providerEventId": provider_message_id,
                        "recipientEmail": email,
                        "recipientPhone": None,
                        "deviceToken": None,
                        "metadata": {
                            "providerMessageId": provider_message_id,
                            "orphaned": transaction is None,
                            "processingTimeMillis": delivery.get("processingTimeMillis"),
                            "smtpResponse": delivery.get("smtpResponse"),
                        },
                        "eventTimestamp": _parse_timestamp(delivery["timestamp"]),
                    },
                )

        if transaction is not None:
            await self._apply_lifecycle_transition(
                transaction, "delivered", _parse_timestamp(delivery["timestamp"])
            )

        return {
            "accepted": True,
            "verified": True,
            "matchedTransactions": 1 if transaction else 0,
            "createdSuppressionEntries": 0,
            "orphanEvents": 0 if transaction else 1,
        }

    async def _apply_lifecycle_transition(
        self, transaction: EmailTransaction, next_status: str, timestamp: datetime
    ) -> None:
        if next_status == "delivered":
            if transaction.status in {"pending", "sent"}:
                await update_email_transaction(
                    self.db,
                    str(transaction.id),
                    {
                        "status": "delivered",
                        "deliveredAt": transaction.delivered_at or timestamp,
                    },
                )
            return

        if _is_terminal_status(transaction.status):
            return

        timestamp_field = (
            {"bouncedAt": transaction.bounced_at or timestamp}
            if next_status == "bounced"
            else {"complainedAt": transaction.complained_at or timestamp}
        )
        await update_email_transaction(
            self.db,
            str(transaction.id),
            {
                "status": next_status,
                **timestamp_field,
            },
        )
