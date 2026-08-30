"""Main Sendfn client."""

from datetime import datetime
from typing import Any, Optional

from superfunctions.db import Adapter

from .email.service import EmailService
from .email.templates import TemplateEngine, TemplateRegistry
from .errors import (
    DatabaseError,
    EmailProviderError,
    PushProviderError,
    SendfnError,
    SmsProviderError,
    SuppressionError,
    TemplateError,
    ValidationError,
)
from .events.aws_sns_verifier import AwsSnsVerifier
from .events.tracker import EventTracker
from .events.webhook_handler import AwsSesWebhookHandler
from .models import (
    ApnsConfig,
    CommunicationEvent,
    DeviceToken,
    EmailConfig,
    EmailTemplate,
    EmailTransaction,
    FcmConfig,
    Platform,
    PushConfig,
    PushNotification,
    RegisterDeviceParams,
    SendEmailParams,
    SendfnOptions,
    SendPushParams,
    SendSmsParams,
    SmsTransaction,
    SuppressionList,
)
from .push.device_manager import DeviceTokenManager
from .push.service import PushService
from .sms.provider import SmsProvider
from .sms.service import SmsService
from .suppression.manager import SuppressionManager


class SendfnConfig:
    """Sendfn configuration."""

    def __init__(
        self,
        database: Adapter,
        email: Optional[EmailConfig] = None,
        push: Optional[PushConfig] = None,
        sms_provider: Optional[SmsProvider] = None,
        options: Optional[SendfnOptions] = None,
        aws_sns_topic_arns: Optional[list[str]] = None,
        aws_sns_max_age_seconds: Optional[int] = None,
    ) -> None:
        """Initialize configuration.

        Args:
            database: Database adapter
            email: Email configuration
            push: Push notification configuration
            sms_provider: SMS provider instance
            options: Sendfn options
        """
        self.database = database
        self.email = email
        self.push = push
        self.sms_provider = sms_provider
        self.options = options or SendfnOptions()  # type: ignore[call-arg]
        self.aws_sns_topic_arns = aws_sns_topic_arns or []
        self.aws_sns_max_age_seconds = aws_sns_max_age_seconds


class Sendfn:
    """Main Sendfn client."""

    def __init__(self, config: SendfnConfig) -> None:
        """Initialize Sendfn client.

        Args:
            config: Sendfn configuration
        """
        self.config = config

        # Use database adapter directly
        self.db = config.database

        # Initialize event tracker
        self.event_tracker = EventTracker(
            self.db,
            enabled=config.options.event_tracking if config.options else True,
        )

        # Initialize suppression manager
        self.suppression_manager = SuppressionManager(
            self.db,
            enabled=config.options.suppression_enabled if config.options else True,
        )

        # Template registry must exist before any email-service wiring touches it.
        self.template_registry = TemplateRegistry()
        self._closed = False

        # Initialize email service if configured
        self.email_service: Optional[EmailService] = None
        if config.email:
            self._initialize_email_service(config.email)

        # Initialize device manager
        self.device_manager = DeviceTokenManager(self.db)

        # Initialize push service if configured
        self.push_service: Optional[PushService] = None
        if config.push:
            self._initialize_push_service(config.push)

        # Initialize SMS service if configured
        self.sms_service: Optional[SmsService] = None
        if config.sms_provider:
            self._initialize_sms_service(config.sms_provider)

        # Initialize webhook handler
        self.webhook_handler = AwsSesWebhookHandler(
            self.db,
            self.suppression_manager,
            verifier=AwsSnsVerifier(
                topic_arns=config.aws_sns_topic_arns,
                max_age_seconds=config.aws_sns_max_age_seconds,
            ),
        )

    def _coerce_error(
        self,
        error: Exception,
        error_cls: type[SendfnError],
    ) -> SendfnError:
        if isinstance(error, SendfnError):
            return error
        return error_cls(
            str(error) or "Unexpected sendfn error",
            details={"cause": error.__class__.__name__},
        )

    def _initialize_email_service(self, email_config: EmailConfig) -> None:
        """Initialize email service.

        Args:
            email_config: Email configuration
        """
        # Create email provider (AWS SES)
        if email_config.aws_ses:
            from .email.aws_ses import AwsSesProvider

            provider = AwsSesProvider(email_config.aws_ses)
        else:
            raise EmailProviderError("Email provider configuration required")

        # Create template engine
        template_engine = TemplateEngine()

        # Create email service
        self.email_service = EmailService(
            provider=provider,
            db=self.db,
            template_engine=template_engine,
            template_registry=self.template_registry,
            suppression_manager=self.suppression_manager,
            event_tracker=self.event_tracker,
            config=email_config,
            retry_attempts=self.config.options.retry_attempts if self.config.options else 3,
            retry_delay=self.config.options.retry_delay if self.config.options else 1000,
        )

    def _initialize_push_service(self, push_config: PushConfig) -> None:
        """Initialize push service.

        Args:
            push_config: Push notification configuration
        """
        providers: dict[Platform, Any] = {}

        # Initialize FCM if configured
        if "fcm" in push_config.providers:
            from .push.fcm import FcmProvider

            fcm_config = push_config.providers["fcm"]
            if isinstance(fcm_config, FcmConfig):
                fcm_provider = FcmProvider(fcm_config)
                providers["android"] = fcm_provider
                providers["web"] = fcm_provider

        # Initialize APNS if configured
        if "apns" in push_config.providers:
            from .push.apns import ApnsProvider

            apns_config = push_config.providers["apns"]
            if isinstance(apns_config, ApnsConfig):
                providers["ios"] = ApnsProvider(apns_config)

        # Create push service
        self.push_service = PushService(
            providers=providers,
            db=self.db,
            device_manager=self.device_manager,
            bulk_concurrency=self.config.options.bulk_concurrency if self.config.options else 5,
            event_tracking=self.config.options.event_tracking if self.config.options else True,
        )

    def _initialize_sms_service(self, sms_provider: SmsProvider) -> None:
        """Initialize SMS service.

        Args:
            sms_provider: SMS provider instance
        """
        self.sms_service = SmsService(
            provider=sms_provider,
            db=self.db,
        )

    # --- Email Methods ---

    async def send_email(self, params: SendEmailParams) -> EmailTransaction:
        """Send an email.

        Args:
            params: Email send parameters

        Returns:
            Email transaction

        Raises:
            SendfnError: If email service is not configured
        """
        if not self.email_service:
            raise EmailProviderError("Email service not configured")

        try:
            return await self.email_service.send_email(params)
        except Exception as error:
            raise self._coerce_error(error, EmailProviderError) from error

    async def send_bulk_email(
        self, recipients: list[SendEmailParams]
    ) -> list[EmailTransaction]:
        """Send bulk emails.

        Args:
            recipients: List of email send parameters

        Returns:
            List of email transactions
        """
        if not self.email_service:
            raise EmailProviderError("Email service not configured")

        try:
            return await self.email_service.send_bulk_email(recipients)
        except Exception as error:
            raise self._coerce_error(error, EmailProviderError) from error

    # --- SMS Methods ---

    async def send_sms(self, params: SendSmsParams) -> SmsTransaction:
        """Send an SMS.

        Args:
            params: SMS send parameters

        Returns:
            SMS transaction

        Raises:
            SendfnError: If SMS service is not configured
        """
        if not self.sms_service:
            raise SmsProviderError("SMS service not configured")

        try:
            return await self.sms_service.send_sms(params)
        except Exception as error:
            raise self._coerce_error(error, SmsProviderError) from error

    # --- Push Methods ---

    async def send_push(self, params: SendPushParams) -> PushNotification:
        """Send a push notification.

        Args:
            params: Push send parameters

        Returns:
            Push notification

        Raises:
            SendfnError: If push service is not configured
        """
        if not self.push_service:
            raise PushProviderError("Push service not configured")

        try:
            return await self.push_service.send_push(params)
        except Exception as error:
            raise self._coerce_error(error, PushProviderError) from error

    async def send_bulk_push(
        self, notifications: list[SendPushParams]
    ) -> list[PushNotification]:
        """Send bulk push notifications.

        Args:
            notifications: List of push send parameters

        Returns:
            List of push notifications

        Raises:
            SendfnError: If push service is not configured
        """
        if not self.push_service:
            raise PushProviderError("Push service not configured")

        try:
            return await self.push_service.send_bulk_push(notifications)
        except Exception as error:
            raise self._coerce_error(error, PushProviderError) from error

    # --- Device Management ---

    async def register_device(self, params: RegisterDeviceParams) -> DeviceToken:
        """Register a device token.

        Args:
            params: Device registration parameters

        Returns:
            Device token
        """
        try:
            return await self.device_manager.register_device(params)
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def get_devices(
        self, user_id: str, platform: Optional[Platform] = None
    ) -> list[DeviceToken]:
        """Get device tokens for a user.

        Args:
            user_id: User ID
            platform: Optional platform filter

        Returns:
            List of device tokens
        """
        try:
            return await self.device_manager.get_active_devices(user_id, platform)
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def deactivate_device(self, token: str) -> None:
        """Deactivate a device token.

        Args:
            token: Device token
        """
        try:
            await self.device_manager.deactivate_tokens([token])
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def refresh_device_token(
        self,
        old_token: str,
        new_token: str,
        user_id: str,
        platform: Platform,
    ) -> DeviceToken:
        """Replace an existing device token with a new active token."""
        try:
            return await self.device_manager.refresh_device_token(
                old_token=old_token,
                new_token=new_token,
                user_id=user_id,
                platform=platform,
            )
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def cleanup_inactive_devices(self, older_than: datetime) -> int:
        """Delete inactive device records older than the cutoff."""
        try:
            return await self.device_manager.cleanup_inactive_devices(older_than)
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    # --- Template Management ---

    async def register_template(self, template: EmailTemplate) -> None:
        """Register an email template.

        Args:
            template: Email template
        """
        try:
            self.template_registry.register(template)
        except Exception as error:
            raise self._coerce_error(error, TemplateError) from error

    async def get_template(self, template_id: str) -> Optional[EmailTemplate]:
        """Get an email template by ID.

        Args:
            template_id: Template ID

        Returns:
            Email template or None
        """
        return self.template_registry.get(template_id)

    async def list_templates(self) -> list[EmailTemplate]:
        """List all registered templates.

        Returns:
            List of email templates
        """
        return self.template_registry.list()

    # --- Event Queries ---

    async def get_email_events(self, transaction_id: str) -> list[CommunicationEvent]:
        """Get events for an email transaction.

        Args:
            transaction_id: Email transaction ID

        Returns:
            List of communication events
        """
        try:
            return await self.event_tracker.get_events_by_reference(transaction_id, "email")
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def get_push_events(self, notification_id: str) -> list[CommunicationEvent]:
        """Get events for a push notification.

        Args:
            notification_id: Push notification ID

        Returns:
            List of communication events
        """
        try:
            return await self.event_tracker.get_events_by_reference(notification_id, "push")
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def get_sms_events(self, transaction_id: str) -> list[CommunicationEvent]:
        """Get events for an SMS transaction.

        Args:
            transaction_id: SMS transaction ID

        Returns:
            List of communication events
        """
        try:
            return await self.event_tracker.get_events_by_reference(transaction_id, "sms")
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    async def query_events(self, **filters: Any) -> list[CommunicationEvent]:
        """Query communication events using the public client surface."""
        try:
            return await self.event_tracker.query_events(**filters)
        except Exception as error:
            raise self._coerce_error(error, DatabaseError) from error

    # --- Suppression Management ---

    async def check_suppression_list(self, email: str) -> dict:
        """Check if an email is suppressed.

        Args:
            email: Email address

        Returns:
            Dictionary with suppression status and entry
        """
        try:
            is_suppressed = await self.suppression_manager.is_suppressed(email)
            entry = None
            if is_suppressed:
                entry = await self.suppression_manager.get_suppression_entry(email)

            return {
                "suppressed": is_suppressed,
                "entry": entry,
            }
        except Exception as error:
            raise self._coerce_error(error, SuppressionError) from error

    async def add_to_suppression_list(
        self,
        email: str,
        reason: str,
        source: str = "manual",
        bounce_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SuppressionList:
        """Add an email to the suppression list.

        Args:
            email: Email address
            reason: Suppression reason
            source: Source of suppression
            bounce_type: Type of bounce
            metadata: Additional metadata

        Returns:
            Suppression list entry
        """
        try:
            return await self.suppression_manager.add_to_suppression_list(
                email=email,
                reason=reason,  # type: ignore
                source=source,
                bounce_type=bounce_type,
                metadata=metadata,
            )
        except Exception as error:
            raise self._coerce_error(error, SuppressionError) from error

    async def remove_from_suppression_list(self, email: str) -> None:
        """Remove an email from the suppression list.

        Args:
            email: Email address
        """
        try:
            await self.suppression_manager.remove_from_suppression_list(email)
        except Exception as error:
            raise self._coerce_error(error, SuppressionError) from error

    async def bulk_add_to_suppression_list(self, entries: list[dict[str, Any]]) -> None:
        """Add multiple entries to the suppression list."""
        try:
            await self.suppression_manager.bulk_add_to_suppression_list(entries)
        except Exception as error:
            raise self._coerce_error(error, SuppressionError) from error

    async def export_suppression_list(
        self,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[SuppressionList]:
        """Export suppression list entries using the public client surface."""
        try:
            return await self.suppression_manager.export_suppression_list(limit=limit, offset=offset)
        except Exception as error:
            raise self._coerce_error(error, SuppressionError) from error

    # --- Webhook Handlers ---

    def get_webhook_handlers(self) -> dict[str, AwsSesWebhookHandler]:
        """Get webhook handlers.

        Returns:
            Dictionary of webhook handlers
        """
        if not any(
            isinstance(topic_arn, str) and topic_arn.strip()
            for topic_arn in self.config.aws_sns_topic_arns
        ):
            raise ValidationError(
                "Configure at least one `aws_sns_topic_arns` entry before exposing AWS SES webhooks"
            )
        return {
            "awsSes": self.webhook_handler,
        }

    async def close(self) -> None:
        """Close all configured providers and the underlying adapter exactly once."""
        if self._closed:
            return

        resources: list[Any] = []
        if self.email_service:
            resources.append(self.email_service.provider)
        if self.sms_service:
            resources.append(self.sms_service.provider)
        if self.push_service:
            resources.extend(self.push_service.providers.values())
        resources.append(self.db)

        seen: set[int] = set()
        for resource in resources:
            resource_id = id(resource)
            if resource_id in seen:
                continue
            seen.add(resource_id)

            close = getattr(resource, "close", None)
            if callable(close):
                await close()

        self._closed = True


def create_sendfn(config: SendfnConfig) -> Sendfn:
    """Create a Sendfn client instance.

    Args:
        config: Sendfn configuration

    Returns:
        Sendfn client instance
    """
    return Sendfn(config)
