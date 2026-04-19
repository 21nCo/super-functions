from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel

SAFE_IDENTIFIER_KEYS = {
    "fileid",
    "versionid",
    "artifactid",
    "policyid",
    "requestid",
    "uploadsessionid",
}
SENSITIVE_KEY_MARKERS = (
    "token",
    "secret",
    "password",
    "signature",
    "authorization",
    "credential",
    "cookie",
    "signedurl",
    "signed_url",
)

class FileFnEvent(BaseModel):
    type: str
    timestamp: str
    requestId: Optional[str] = None

class UploadStartedEvent(FileFnEvent):
    type: str = 'upload.started'
    uploadSessionId: str
    fileName: str
    size: int
    mimeType: str
    policy: str
    principalId: Optional[str] = None
    tenantId: Optional[str] = None

class PartRecordedEvent(FileFnEvent):
    type: str = 'part.recorded'
    uploadSessionId: str
    partNumber: int
    size: int

class FileUploadedEvent(FileFnEvent):
    type: str = 'file:uploaded'
    fileId: str
    versionId: str
    fileName: str
    size: int
    mimeType: str
    ownerId: str
    tenantId: Optional[str] = None

class FileDeletedEvent(FileFnEvent):
    type: str = 'file:deleted'
    fileId: str
    ownerId: str
    tenantId: Optional[str] = None

class ProcessingStartedEvent(FileFnEvent):
    type: str = 'processing.started'
    fileId: str
    versionId: str

class ProcessingCompletedEvent(FileFnEvent):
    type: str = 'processing.completed'
    fileId: str
    versionId: str
    artifactsCreated: int

class ProcessingFailedEvent(FileFnEvent):
    type: str = 'processing.failed'
    fileId: str
    versionId: str
    error: Optional[str] = None

def get_current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()

def create_upload_started_event(data: Dict[str, Any], request_id: Optional[str] = None) -> UploadStartedEvent:
    return UploadStartedEvent(
        timestamp=get_current_timestamp(),
        requestId=request_id,
        **data
    )

def create_part_recorded_event(data: Dict[str, Any], request_id: Optional[str] = None) -> PartRecordedEvent:
    return PartRecordedEvent(
        timestamp=get_current_timestamp(),
        requestId=request_id,
        **data
    )

def create_file_uploaded_event(data: Dict[str, Any], request_id: Optional[str] = None) -> FileUploadedEvent:
    return FileUploadedEvent(
        timestamp=get_current_timestamp(),
        requestId=request_id,
        **data
    )

def create_file_deleted_event(data: Dict[str, Any], request_id: Optional[str] = None) -> FileDeletedEvent:
    return FileDeletedEvent(
        timestamp=get_current_timestamp(),
        requestId=request_id,
        **data
    )

class FileFnEventEmitter:
    def __init__(self) -> None:
        self._listeners: Dict[str, List[Callable[[Any], None]]] = {}

    def on(self, event_type: str, listener: Callable[[Any], None]) -> 'FileFnEventEmitter':
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(listener)
        return self

    def emit(self, event_type: str, payload: Any) -> bool:
        if event_type not in self._listeners:
            return False
        for listener in self._listeners[event_type]:
            try:
                listener(payload)
            except Exception:
                # Log error or suppress? Usually suppress in EventEmitter
                pass
        return True

def create_event_emitter() -> FileFnEventEmitter:
    return FileFnEventEmitter()


def _should_redact_key(key: str) -> bool:
    lower_key = key.lower()
    if lower_key in SAFE_IDENTIFIER_KEYS:
        return False
    return any(marker in lower_key for marker in SENSITIVE_KEY_MARKERS)


def _should_redact_string(key: str, value: str) -> bool:
    lower_key = key.lower()
    lower_value = value.lower()
    if lower_key in SAFE_IDENTIFIER_KEYS:
        return False
    if value.startswith("http://") or value.startswith("https://"):
        if "?" in value or "signature=" in lower_value or "sig=" in lower_value or "token=" in lower_value:
            return True
    if lower_value.startswith("bearer "):
        return True
    if "x-amz-signature" in lower_value:
        return True
    return False


def redact_secrets(value: Any, key: str = "") -> Any:
    if value is None:
        return None

    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for child_key, child_value in value.items():
            if _should_redact_key(child_key):
                result[child_key] = "[REDACTED]"
            else:
                result[child_key] = redact_secrets(child_value, child_key)
        return result

    if isinstance(value, list):
        return [redact_secrets(item, key) for item in value]

    if isinstance(value, tuple):
        return tuple(redact_secrets(item, key) for item in value)

    if isinstance(value, str) and _should_redact_string(key, value):
        return "[REDACTED]"

    return value
