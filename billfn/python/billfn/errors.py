"""Canonical errors for the Python billfn SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


class BillFnError(Exception):
    """Base Python billfn error."""


@dataclass(slots=True)
class BillFnCanonicalError:
    code: str
    message: str
    status: int
    retryable: bool
    details: Optional[Dict[str, Any]] = None


class BillFnApiError(BillFnError):
    """Raised when a canonical billfn API error envelope is unwrapped."""

    def __init__(self, error: BillFnCanonicalError):
        super().__init__(error.message)
        self.error = error
        self.code = error.code
        self.status = error.status
        self.retryable = error.retryable
        self.details = error.details or {}


class BillFnTransportError(BillFnError):
    """Raised for network, parse, or protocol-level failures."""

    def __init__(self, message: str, *, cause: Optional[BaseException] = None):
        super().__init__(message)
        self.cause = cause
