import re
from typing import Any, Dict, Optional, TypedDict

# Error code constants
SCHEMA_INVALID = "SCHEMA_INVALID"
DFQL_INVALID = "DFQL_INVALID"
DFQL_UNKNOWN_RESOURCE = "DFQL_UNKNOWN_RESOURCE"
DFQL_UNKNOWN_FIELD = "DFQL_UNKNOWN_FIELD"
DFQL_UNKNOWN_RELATION = "DFQL_UNKNOWN_RELATION"
DFQL_ABORTED = "DFQL_ABORTED"
LIMIT_EXCEEDED = "LIMIT_EXCEEDED"
CONFLICT = "CONFLICT"
NOT_FOUND = "NOT_FOUND"
FORBIDDEN = "FORBIDDEN"
INTERNAL = "INTERNAL"

# Patterns for error classification
_DUPLICATE_PATTERNS = [
    re.compile(r"unique constraint", re.IGNORECASE),
    re.compile(r"duplicate key", re.IGNORECASE),
    re.compile(r"UNIQUE constraint failed", re.IGNORECASE),
    re.compile(r"already exists", re.IGNORECASE),
]
_NOT_FOUND_PATTERNS = [
    re.compile(r"not found", re.IGNORECASE),
    re.compile(r"no such", re.IGNORECASE),
    re.compile(r"does not exist", re.IGNORECASE),
]


class DatafnError(Exception):
    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        self.code = code
        self.message = message
        self.details = details or {}
        if "path" not in self.details:
            self.details["path"] = "$"
        super().__init__(message)

    def to_envelope(self) -> Dict[str, Any]:
        return {
            "ok": False,
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details
            }
        }


def classify_error(exception: Exception) -> str:
    msg = str(exception)
    for pat in _DUPLICATE_PATTERNS:
        if pat.search(msg):
            return CONFLICT
    for pat in _NOT_FOUND_PATTERNS:
        if pat.search(msg):
            return NOT_FOUND
    return INTERNAL


def ok_response(result: Any) -> Dict[str, Any]:
    return {"ok": True, "result": result}

def error_response(error: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": False, "error": error}

# Helper aliases
def ok(result: Any) -> Dict[str, Any]:
    return ok_response(result)

def err(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    details = details or {}
    if "path" not in details:
        details["path"] = "$"
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "details": details
        }
    }
