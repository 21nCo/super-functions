"""Sendfn - Self-hosted communications platform SDK.

Sendfn provides email, push notifications, and SMS capabilities with:
- Email sending via AWS SES
- Push notifications via FCM (Android/Web) and APNS (iOS)
- SMS sending (with provider abstraction)
- Event tracking and webhook handling
- Suppression list management
- HTTP API (FastAPI integration)

Example:
    >>> from sendfn import Sendfn, SendfnConfig
    >>> from sendfn.database.memory import MemoryAdapter
    >>>
    >>> config = SendfnConfig(
    ...     database=MemoryAdapter(),
    ...     email=EmailConfig(
    ...         from_email="noreply@example.com",
    ...         aws_ses=AwsSesConfig(
    ...             access_key_id="...",
    ...             secret_access_key="...",
    ...             region="us-east-1"
    ...         )
    ...     )
    ... )
    >>> client = Sendfn(config)
    >>> await client.send_email(SendEmailParams(
    ...     user_id="user-123",
    ...     to="user@example.com",
    ...     subject="Hello",
    ...     html="<p>Hello World</p>"
    ... ))
"""

# ruff: noqa: E402

import sys
from importlib import import_module
from pathlib import Path

__version__ = "0.1.0"


def _bootstrap_repo_local_superfunctions() -> None:
    """Prefer the monorepo shared Python core when it is available locally."""
    try:
        import_module("superfunctions.db")
        return
    except ModuleNotFoundError as error:
        if error.name not in {"superfunctions", "superfunctions.db"}:
            raise
        repo_python_core = Path(__file__).resolve().parents[3] / "packages" / "python-core"
        if repo_python_core.exists():
            sys.path.insert(0, str(repo_python_core))


_bootstrap_repo_local_superfunctions()

from .client import Sendfn, SendfnConfig, create_sendfn
from .database.memory import MemoryAdapter
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
from .models import (
    ApnsConfig,
    Attachment,
    AwsSesConfig,
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

__all__ = [
    # Main client
    "Sendfn",
    "SendfnConfig",
    "create_sendfn",
    # Database
    "MemoryAdapter",
    # Models and types
    "ApnsConfig",
    "Attachment",
    "AwsSesConfig",
    "CommunicationEvent",
    "DeviceToken",
    "EmailConfig",
    "EmailTemplate",
    "EmailTransaction",
    "FcmConfig",
    "Platform",
    "PushConfig",
    "PushNotification",
    "RegisterDeviceParams",
    "SendEmailParams",
    "SendfnOptions",
    "SendPushParams",
    "SendSmsParams",
    "SmsTransaction",
    "SuppressionList",
    # Errors
    "SendfnError",
    "EmailProviderError",
    "PushProviderError",
    "SmsProviderError",
    "SuppressionError",
    "TemplateError",
    "DatabaseError",
    "ValidationError",
]
