"""Error types for the adapter system."""

from enum import Enum
from typing import Any, Dict, Optional


class AdapterErrorCode(str, Enum):
    """Error codes for adapter errors."""

    CONNECTION_ERROR = "CONNECTION_ERROR"
    CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION"
    NOT_FOUND = "NOT_FOUND"
    DUPLICATE_KEY = "DUPLICATE_KEY"
    QUERY_FAILED = "QUERY_FAILED"
    TRANSACTION_ERROR = "TRANSACTION_ERROR"
    SCHEMA_VALIDATION_ERROR = "SCHEMA_VALIDATION_ERROR"
    OPERATION_NOT_SUPPORTED = "OPERATION_NOT_SUPPORTED"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"


class AdapterError(Exception):
    """Base exception for adapter errors."""

    def __init__(
        self,
        message: str,
        code: AdapterErrorCode = AdapterErrorCode.UNKNOWN,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.cause = cause
        self.details = details or {}

    def __str__(self) -> str:
        parts = [f"[{self.code.value}] {self.message}"]
        if self.cause:
            parts.append(f"Caused by: {str(self.cause)}")
        if self.details:
            parts.append(f"Details: {self.details}")
        return " | ".join(parts)


class ConnectionError(AdapterError):
    """Database connection error."""

    def __init__(
        self,
        message: str = "Failed to connect to database",
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, AdapterErrorCode.CONNECTION_ERROR, cause, details)


class ConstraintViolationError(AdapterError):
    """Database constraint violation error."""

    def __init__(
        self,
        message: str = "Constraint violation",
        constraint: Optional[str] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if constraint:
            details["constraint"] = constraint
        super().__init__(message, AdapterErrorCode.CONSTRAINT_VIOLATION, cause, details)


class NotFoundError(AdapterError):
    """Record not found error."""

    def __init__(
        self,
        message: str = "Record not found",
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, AdapterErrorCode.NOT_FOUND, cause, details)


class DuplicateKeyError(AdapterError):
    """Duplicate key error."""

    def __init__(
        self,
        message: str = "Duplicate key violation",
        key: Optional[str] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if key:
            details["key"] = key
        super().__init__(message, AdapterErrorCode.DUPLICATE_KEY, cause, details)


class QueryFailedError(AdapterError):
    """Query execution failed."""

    def __init__(
        self,
        message: str = "Query execution failed",
        query: Optional[str] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if query:
            details["query"] = query
        super().__init__(message, AdapterErrorCode.QUERY_FAILED, cause, details)


class TransactionError(AdapterError):
    """Transaction error."""

    def __init__(
        self,
        message: str = "Transaction failed",
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, AdapterErrorCode.TRANSACTION_ERROR, cause, details)


class SchemaValidationError(AdapterError):
    """Schema validation error."""

    def __init__(
        self,
        message: str = "Schema validation failed",
        errors: Optional[list] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if errors:
            details["errors"] = errors
        super().__init__(message, AdapterErrorCode.SCHEMA_VALIDATION_ERROR, cause, details)


class OperationNotSupportedError(AdapterError):
    """Operation not supported by adapter."""

    def __init__(
        self,
        message: str = "Operation not supported",
        operation: Optional[str] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if operation:
            details["operation"] = operation
        super().__init__(message, AdapterErrorCode.OPERATION_NOT_SUPPORTED, cause, details)


class TimeoutError(AdapterError):
    """Operation timeout error."""

    def __init__(
        self,
        message: str = "Operation timed out",
        timeout: Optional[int] = None,
        cause: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        details = details or {}
        if timeout:
            details["timeout"] = timeout
        super().__init__(message, AdapterErrorCode.TIMEOUT, cause, details)
