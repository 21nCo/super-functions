"""Pydantic models for sendfn."""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# --- Database Models ---


class EmailTransaction(BaseModel):
    """Email transaction record."""

    id: UUID
    user_id: str = Field(alias="userId")
    to: EmailStr
    from_: EmailStr = Field(alias="from")
    subject: str
    template_id: Optional[str] = Field(None, alias="templateId")
    template_data: Optional[dict[str, Any]] = Field(None, alias="templateData")
    provider: str
    provider_message_id: Optional[str] = Field(None, alias="providerMessageId")
    status: Literal["pending", "sent", "delivered", "bounced", "complained", "failed"]
    sent_at: Optional[datetime] = Field(None, alias="sentAt")
    delivered_at: Optional[datetime] = Field(None, alias="deliveredAt")
    bounced_at: Optional[datetime] = Field(None, alias="bouncedAt")
    complained_at: Optional[datetime] = Field(None, alias="complainedAt")
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class SmsTransaction(BaseModel):
    """SMS transaction record."""

    id: UUID
    user_id: str = Field(alias="userId")
    to: str
    message: str
    provider: str
    provider_message_id: Optional[str] = Field(None, alias="providerMessageId")
    status: Literal["pending", "sent", "delivered", "failed"]
    sent_at: Optional[datetime] = Field(None, alias="sentAt")
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class PushNotification(BaseModel):
    """Push notification record."""

    id: UUID
    user_id: str = Field(alias="userId")
    title: str
    body: str
    data: Optional[dict[str, Any]] = None
    device_tokens: list[str] = Field(alias="deviceTokens")
    platform: Literal["ios", "android", "web"]
    provider: str
    status: Literal["pending", "sent", "failed"]
    sent_count: int = Field(0, alias="sentCount")
    failed_count: int = Field(0, alias="failedCount")
    sent_at: Optional[datetime] = Field(None, alias="sentAt")
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class DeviceToken(BaseModel):
    """Device token record."""

    id: UUID
    user_id: str = Field(alias="userId")
    token: str
    platform: Literal["ios", "android", "web"]
    app_version: Optional[str] = Field(None, alias="appVersion")
    device_info: Optional[dict[str, Any]] = Field(None, alias="deviceInfo")
    is_active: bool = Field(True, alias="isActive")
    last_used_at: datetime = Field(alias="lastUsedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class SuppressionList(BaseModel):
    """Suppression list entry."""

    id: UUID
    email: EmailStr
    reason: Literal["bounce", "complaint", "unsubscribe", "manual"]
    source: str
    bounce_type: Optional[str] = Field(None, alias="bounceType")
    metadata: dict[str, Any] = Field(default_factory=dict)
    suppressed_at: datetime = Field(alias="suppressedAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: Any) -> Any:
        """Normalize suppression emails before validation."""
        if isinstance(value, str):
            return value.strip().lower()
        return value


class CommunicationEvent(BaseModel):
    """Communication event record."""

    id: UUID
    reference_id: str = Field(alias="referenceId")
    reference_type: Literal["email", "push", "sms"] = Field(alias="referenceType")
    event_type: Literal[
        "sent", "delivered", "bounced", "complained", "opened", "clicked", "failed"
    ] = Field(alias="eventType")
    provider: str
    provider_event_id: Optional[str] = Field(None, alias="providerEventId")
    recipient_email: Optional[EmailStr] = Field(None, alias="recipientEmail")
    recipient_phone: Optional[str] = Field(None, alias="recipientPhone")
    device_token: Optional[str] = Field(None, alias="deviceToken")
    metadata: dict[str, Any] = Field(default_factory=dict)
    event_timestamp: datetime = Field(alias="eventTimestamp")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


# --- Configuration Models ---


class AwsSesConfig(BaseModel):
    """AWS SES configuration."""

    access_key_id: str = Field(alias="accessKeyId")
    secret_access_key: str = Field(alias="secretAccessKey")
    region: str
    configuration_set_name: Optional[str] = Field(None, alias="configurationSetName")

    model_config = {"populate_by_name": True}


class EmailConfig(BaseModel):
    """Email configuration."""

    from_email: EmailStr = Field(alias="fromEmail")
    from_name: Optional[str] = Field(None, alias="fromName")
    reply_to: Optional[EmailStr] = Field(None, alias="replyTo")
    aws_ses: Optional[AwsSesConfig] = Field(None, alias="awsSes")

    model_config = {"populate_by_name": True}


class FcmConfig(BaseModel):
    """Firebase Cloud Messaging configuration."""

    service_account_key: dict[str, Any] | str = Field(alias="serviceAccountKey")
    project_id: Optional[str] = Field(None, alias="projectId")

    model_config = {"populate_by_name": True}


class ApnsConfig(BaseModel):
    """Apple Push Notification Service configuration."""

    key_id: str = Field(alias="keyId")
    team_id: str = Field(alias="teamId")
    key: str  # P8 certificate content
    production: bool = True

    model_config = {"populate_by_name": True}


class PushConfig(BaseModel):
    """Push notification configuration."""

    providers: dict[str, FcmConfig | ApnsConfig] = Field(default_factory=dict)

    @field_validator("providers")
    @classmethod
    def validate_providers(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate provider configurations."""
        valid_keys = {"fcm", "apns"}
        for key in v.keys():
            if key not in valid_keys:
                raise ValueError(f"Invalid provider: {key}. Must be one of {valid_keys}")
        return v


class SendfnOptions(BaseModel):
    """Sendfn options."""

    suppression_enabled: bool = Field(True, alias="suppressionEnabled")
    retry_attempts: int = Field(3, alias="retryAttempts")
    retry_delay: int = Field(1000, alias="retryDelay")  # milliseconds
    event_tracking: bool = Field(True, alias="eventTracking")
    bulk_concurrency: int = Field(5, alias="bulkConcurrency")

    model_config = {"populate_by_name": True}


# --- Request/Response Models ---


class Attachment(BaseModel):
    """Email attachment."""

    filename: str
    content: bytes | str
    content_type: Optional[str] = Field(None, alias="contentType")
    encoding: Optional[str] = None

    model_config = {"populate_by_name": True}


class SendEmailParams(BaseModel):
    """Parameters for sending an email."""

    user_id: str = Field(alias="userId")
    to: EmailStr | list[EmailStr]
    cc: Optional[EmailStr | list[EmailStr]] = None
    bcc: Optional[EmailStr | list[EmailStr]] = None
    subject: Optional[str] = None
    html: Optional[str] = None
    text: Optional[str] = None
    template_id: Optional[str] = Field(None, alias="templateId")
    template_data: Optional[dict[str, Any]] = Field(None, alias="templateData")
    attachments: Optional[list[Attachment]] = None
    metadata: Optional[dict[str, Any]] = None
    tags: Optional[list[str]] = None

    model_config = {"populate_by_name": True}

    @field_validator("to", "cc", "bcc")
    @classmethod
    def normalize_emails(cls, v: EmailStr | list[EmailStr] | None) -> list[EmailStr] | None:
        """Normalize email addresses to list."""
        if v is None:
            return None
        if isinstance(v, str):
            return [v]
        return v


class SendSmsParams(BaseModel):
    """Parameters for sending an SMS."""

    user_id: str = Field(alias="userId")
    to: str  # Phone number
    message: str
    metadata: Optional[dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class SendPushParams(BaseModel):
    """Parameters for sending a push notification."""

    user_id: str | list[str] = Field(alias="userId")
    title: str
    body: str
    data: Optional[dict[str, Any]] = None
    image_url: Optional[str] = Field(None, alias="imageUrl")
    badge: Optional[int] = None
    sound: Optional[str] = None
    priority: Literal["high", "normal"] = "normal"
    ttl: Optional[int] = None  # Time to live in seconds
    collapse_key: Optional[str] = Field(None, alias="collapseKey")
    category: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None

    model_config = {"populate_by_name": True}

    @field_validator("user_id")
    @classmethod
    def normalize_user_ids(cls, v: str | list[str]) -> list[str]:
        """Normalize user IDs to list."""
        if isinstance(v, str):
            return [v]
        return v


class RegisterDeviceParams(BaseModel):
    """Parameters for registering a device token."""

    user_id: str = Field(alias="userId")
    token: str
    platform: Literal["ios", "android", "web"]
    app_version: Optional[str] = Field(None, alias="appVersion")
    device_info: Optional[dict[str, Any]] = Field(None, alias="deviceInfo")

    model_config = {"populate_by_name": True}


class EmailTemplate(BaseModel):
    """Email template definition."""

    id: str
    name: str
    subject: str
    html: str
    text: Optional[str] = None
    variables: list[str]
    metadata: Optional[dict[str, Any]] = None


# --- Type Aliases ---

Platform = Literal["ios", "android", "web"]
EmailStatus = Literal["pending", "sent", "delivered", "bounced", "complained", "failed"]
SmsStatus = Literal["pending", "sent", "delivered", "failed"]
PushStatus = Literal["pending", "sent", "failed"]
SuppressionReason = Literal["bounce", "complaint", "unsubscribe", "manual"]
EventType = Literal["sent", "delivered", "bounced", "complained", "opened", "clicked", "failed"]
ReferenceType = Literal["email", "push", "sms"]
