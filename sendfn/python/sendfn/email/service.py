"""Email service orchestration."""

import asyncio
from typing import Optional, TypedDict

from superfunctions.db import Adapter

from .._concurrency import map_with_concurrency, resolve_concurrency
from ..database import helpers as db_helpers
from ..errors import EmailProviderError, SuppressionError, TemplateError, ValidationError
from ..events.tracker import EventTracker
from ..models import Attachment, EmailConfig, EmailTransaction, SendEmailParams
from ..suppression.manager import SuppressionManager
from .provider import (
    EmailProvider,
    SendEmailRequest,
    SendEmailResponse,
    decode_attachment_content,
)
from .templates import TemplateEngine, TemplateRegistry

DEFAULT_MAX_RECIPIENTS = 50
DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


class RecipientGroups(TypedDict):
    to: list[str]
    cc: list[str]
    bcc: list[str]


class ResolvedEmailContent(TypedDict):
    subject: str
    html: str
    text: Optional[str]


class EmailService:
    """Email service orchestration."""

    def __init__(
        self,
        provider: EmailProvider,
        db: Adapter,
        template_engine: TemplateEngine,
        template_registry: TemplateRegistry,
        suppression_manager: SuppressionManager,
        event_tracker: EventTracker,
        config: EmailConfig,
        retry_attempts: int = 3,
        retry_delay: int = 1000,
        bulk_concurrency: int = 5,
    ) -> None:
        self.provider = provider
        self.db = db
        self.template_engine = template_engine
        self.template_registry = template_registry
        self.suppression_manager = suppression_manager
        self.event_tracker = event_tracker
        self.config = config
        self.retry_attempts = retry_attempts
        self.retry_delay = retry_delay
        self.bulk_concurrency = resolve_concurrency(bulk_concurrency, 5)

    async def send_email(self, params: SendEmailParams) -> EmailTransaction:
        """Send an email."""
        recipients = self._normalize_recipients(params)
        await self._assert_recipients_not_suppressed(
            [*recipients["to"], *recipients["cc"], *recipients["bcc"]]
        )

        rendered = self._resolve_content(params)
        self._assert_resolved_content(rendered["subject"], rendered["html"])
        self._assert_provider_limits(recipients, params.attachments)

        transaction = await db_helpers.create_email_transaction(
            self.db,
            {
                "userId": params.user_id,
                "to": recipients["to"][0],
                "from": self.config.from_email,
                "subject": rendered["subject"],
                "templateId": params.template_id,
                "templateData": params.template_data,
                "provider": self.provider.name,
                "providerMessageId": None,
                "status": "pending",
                "sentAt": None,
                "deliveredAt": None,
                "bouncedAt": None,
                "complainedAt": None,
                "metadata": params.metadata or {},
            },
        )

        from_email = self.config.from_email
        if self.config.from_name:
            from_email = f"{self.config.from_name} <{self.config.from_email}>"

        request = SendEmailRequest(
            from_email=from_email,
            to=recipients["to"],
            subject=rendered["subject"],
            html=rendered["html"],
            text=rendered["text"],
            cc=recipients["cc"] or None,
            bcc=recipients["bcc"] or None,
            attachments=params.attachments,
            reply_to=self.config.reply_to,
            tags={
                **({tag: tag for tag in params.tags} if params.tags else {}),
                "userId": params.user_id,
            },
            metadata=params.metadata,
        )

        try:
            response = await self._send_with_retry(request)
        except Exception as error:
            send_error = (
                error
                if isinstance(error, EmailProviderError)
                else EmailProviderError(
                    str(error) or "Email sending failed",
                    code="SENDFN_INTERNAL_ERROR",
                    retryable=False,
                    details={"provider": self.provider.name},
                )
            )

            await db_helpers.update_email_transaction(
                self.db,
                str(transaction.id),
                {
                    "status": "failed",
                    "metadata": {
                        **transaction.metadata,
                        "error": send_error.args[0],
                        "errorCode": send_error.code,
                    },
                },
            )

            await self.event_tracker.record_event(
                reference_id=str(transaction.id),
                reference_type="email",
                event_type="failed",
                provider=self.provider.name,
                recipient_email=recipients["to"][0],
                metadata={
                    "code": send_error.code,
                    "message": send_error.args[0],
                },
            )

            if send_error is error:
                raise
            raise send_error from error

        transaction = await db_helpers.update_email_transaction(
            self.db,
            str(transaction.id),
            {
                "status": "sent",
                "providerMessageId": response.provider_message_id,
                "sentAt": response.timestamp,
            },
        )

        await self.event_tracker.record_event(
            reference_id=str(transaction.id),
            reference_type="email",
            event_type="sent",
            provider=self.provider.name,
            provider_event_id=response.provider_message_id,
            recipient_email=recipients["to"][0],
        )

        return transaction

    async def send_bulk_email(
        self, recipients: list[SendEmailParams]
    ) -> list[EmailTransaction]:
        """Send bulk emails."""
        return await map_with_concurrency(
            recipients,
            self.bulk_concurrency,
            lambda params, _index: self.send_email(params),
        )

    async def get_email_status(self, transaction_id: str) -> Optional[EmailTransaction]:
        """Get email transaction status."""
        return await db_helpers.get_email_transaction(self.db, transaction_id)

    def _normalize_recipients(self, params: SendEmailParams) -> RecipientGroups:
        to = [params.to] if isinstance(params.to, str) else params.to
        cc = [params.cc] if isinstance(params.cc, str) else params.cc
        bcc = [params.bcc] if isinstance(params.bcc, str) else params.bcc
        return {
            "to": [str(email) for email in to],
            "cc": [str(email) for email in cc] if cc else [],
            "bcc": [str(email) for email in bcc] if bcc else [],
        }

    async def _assert_recipients_not_suppressed(self, recipients: list[str]) -> None:
        if not self.suppression_manager.enabled:
            return

        for email in recipients:
            if await self.suppression_manager.is_suppressed(email):
                raise SuppressionError(
                    "Recipient is suppressed",
                    code="SENDFN_SUPPRESSED",
                    retryable=False,
                    details={"recipient": email},
                )

    def _resolve_content(self, params: SendEmailParams) -> ResolvedEmailContent:
        subject = params.subject
        html = params.html
        text = params.text

        if params.template_id:
            template = self.template_registry.get(params.template_id)
            if not template:
                raise TemplateError(
                    f"Template `{params.template_id}` was not found",
                    code="SENDFN_TEMPLATE_NOT_FOUND",
                    retryable=False,
                )

            template_data = params.template_data or {}
            validation = self.template_engine.validate(template, template_data)
            if not validation["valid"]:
                raise TemplateError(
                    "Template rendering failed validation",
                    code="SENDFN_TEMPLATE_RENDER_ERROR",
                    retryable=False,
                    details={"errors": validation["errors"]},
                )

            subject = self.template_engine.render(template.subject, template_data)
            html = self.template_engine.render(template.html, template_data)
            if template.text:
                text = self.template_engine.render(template.text, template_data)

        return {
            "subject": subject.strip() if subject else "",
            "html": html.strip() if html else "",
            "text": text,
        }

    def _assert_resolved_content(self, subject: str, html_body: str) -> None:
        if not subject or not html_body:
            raise ValidationError(
                "Email must include a subject and HTML body",
                code="SENDFN_VALIDATION_ERROR",
                retryable=False,
            )

    def _assert_provider_limits(
        self,
        recipients: RecipientGroups,
        attachments: Optional[list[Attachment]],
    ) -> None:
        recipient_count = len(recipients["to"]) + len(recipients["cc"]) + len(recipients["bcc"])
        max_recipients = getattr(
            self.provider.capabilities, "max_recipients_per_email", DEFAULT_MAX_RECIPIENTS
        )
        max_attachment_bytes = getattr(
            self.provider.capabilities, "max_attachment_size", DEFAULT_MAX_ATTACHMENT_BYTES
        )
        attachment_bytes = self._attachment_bytes(attachments)

        if recipient_count > max_recipients or attachment_bytes > max_attachment_bytes:
            raise EmailProviderError(
                "Email request exceeds provider limits",
                code="SENDFN_PROVIDER_LIMIT",
                retryable=False,
                details={
                    "recipientCount": recipient_count,
                    "attachmentBytes": attachment_bytes,
                    "maxRecipients": max_recipients,
                    "maxAttachmentBytes": max_attachment_bytes,
                },
            )

    def _attachment_bytes(self, attachments: Optional[list[Attachment]]) -> int:
        if not attachments:
            return 0

        total = 0
        for attachment in attachments:
            total += len(decode_attachment_content(attachment.content, attachment.encoding))
        return total

    async def _send_with_retry(self, request: SendEmailRequest) -> SendEmailResponse:
        max_attempts = max(1, self.retry_attempts)
        retry_delay = max(0, self.retry_delay) / 1000
        last_error: Optional[dict[str, object]] = None

        for attempt in range(1, max_attempts + 1):
            response = await self.provider.send_email(request)

            if response.success:
                return response

            if not response.error or not response.error.get("retryable", False):
                raise EmailProviderError(
                    response.error["message"] if response.error else "Email sending failed",
                    code=str(response.error.get("code", "SENDFN_INTERNAL_ERROR")) if response.error else "SENDFN_INTERNAL_ERROR",
                    retryable=False,
                    details={"attempts": attempt, "provider": self.provider.name},
                )

            last_error = response.error

            if attempt < max_attempts:
                await asyncio.sleep(retry_delay)

        raise EmailProviderError(
            "Email provider retry limit exhausted",
            code="SENDFN_PROVIDER_RETRY_EXHAUSTED",
            retryable=False,
            details={
                "attempts": max_attempts,
                "provider": self.provider.name,
                "providerCode": last_error.get("code") if last_error else None,
            },
        )
