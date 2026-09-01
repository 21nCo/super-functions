"""Exception classes for sendfn."""

from typing import Any, Optional


class SendfnError(Exception):
    """Base exception for all sendfn errors."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_ERROR",
        retryable: bool = False,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.details = details


class EmailProviderError(SendfnError):
    """Error related to email provider operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_EMAIL_PROVIDER_ERROR",
        retryable: bool = True,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class PushProviderError(SendfnError):
    """Error related to push notification provider operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_PUSH_PROVIDER_ERROR",
        retryable: bool = True,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class SmsProviderError(SendfnError):
    """Error related to SMS provider operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_SMS_PROVIDER_ERROR",
        retryable: bool = True,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class SuppressionError(SendfnError):
    """Error related to suppression list operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_SUPPRESSION_ERROR",
        retryable: bool = False,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class TemplateError(SendfnError):
    """Error related to template operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_TEMPLATE_ERROR",
        retryable: bool = False,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class DatabaseError(SendfnError):
    """Error related to database operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_DATABASE_ERROR",
        retryable: bool = True,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)


class ValidationError(SendfnError):
    """Error related to input validation."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SENDFN_VALIDATION_ERROR",
        retryable: bool = False,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, code=code, retryable=retryable, details=details)
