from typing import Any, Dict, Optional


class FileFnError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    @property
    def status_code(self) -> int:
        return self.status

    def to_json(self) -> Dict[str, Any]:
        return {
            'code': self.code,
            'message': self.message,
            'details': self.details,
        }

class ErrorCodes:
    AUTH_REQUIRED = 'FILEFN_AUTH_REQUIRED'
    FORBIDDEN = 'FILEFN_FORBIDDEN'
    NOT_FOUND = 'FILEFN_NOT_FOUND'
    POLICY_CONTENT_TYPE_NOT_ALLOWED = 'FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED'
    POLICY_MAX_SIZE_EXCEEDED = 'FILEFN_POLICY_MAX_SIZE_EXCEEDED'
    POLICY_NOT_FOUND = 'FILEFN_POLICY_NOT_FOUND'
    QUOTA_EXCEEDED = 'FILEFN_QUOTA_EXCEEDED'
    RATE_LIMITED = 'FILEFN_RATE_LIMITED'
    INVALID_PART_NUMBER = 'FILEFN_INVALID_PART_NUMBER'
    INVALID_ETAG = 'FILEFN_INVALID_ETAG'
    UPLOAD_INCOMPLETE = 'FILEFN_UPLOAD_INCOMPLETE'
    UPLOAD_EXPIRED = 'FILEFN_UPLOAD_EXPIRED'
    UPLOAD_ABORTED = 'FILEFN_UPLOAD_ABORTED'
    UPLOAD_ALREADY_COMPLETED = 'FILEFN_UPLOAD_ALREADY_COMPLETED'
    IDEMPOTENCY_CONFLICT = 'FILEFN_IDEMPOTENCY_CONFLICT'
    PART_CONFLICT = 'FILEFN_PART_CONFLICT'
    UPLOAD_SIZE_MISMATCH = 'FILEFN_UPLOAD_SIZE_MISMATCH'
    NO_SUPPORTED_UPLOAD_MODE = 'FILEFN_NO_SUPPORTED_UPLOAD_MODE'
    OFFLINE_UNSUPPORTED = 'FILEFN_OFFLINE_UNSUPPORTED'
    SESSION_NOT_FOUND = 'FILEFN_SESSION_NOT_FOUND'
    SHARE_EXPIRED = 'FILEFN_SHARE_EXPIRED'
    SHARE_REVOKED = 'FILEFN_SHARE_REVOKED'
    SHARE_DOWNLOADS_EXCEEDED = 'FILEFN_SHARE_DOWNLOADS_EXCEEDED'
    SHARE_NOT_FOUND = 'FILEFN_SHARE_NOT_FOUND'
    PERMISSION_NOT_FOUND = 'FILEFN_PERMISSION_NOT_FOUND'
    PROCESSING_ENQUEUE_FAILED = 'FILEFN_PROCESSING_ENQUEUE_FAILED'

def auth_required() -> FileFnError:
    return FileFnError(ErrorCodes.AUTH_REQUIRED, 'Authentication required', 401)

def forbidden(details: Optional[Dict[str, Any]] = None) -> FileFnError:
    return FileFnError(ErrorCodes.FORBIDDEN, 'Access denied', 403, details)

def not_found(resource: str) -> FileFnError:
    return FileFnError(ErrorCodes.NOT_FOUND, f'{resource} not found', 404)

def policy_content_type_not_allowed(policy: str, mime_type: str) -> FileFnError:
    return FileFnError(
        ErrorCodes.POLICY_CONTENT_TYPE_NOT_ALLOWED,
        'Content type not allowed',
        400,
        {'policy': policy, 'mimeType': mime_type}
    )

def policy_max_size_exceeded(policy: str, max_size_bytes: int, size: int) -> FileFnError:
    return FileFnError(
        ErrorCodes.POLICY_MAX_SIZE_EXCEEDED,
        'File size exceeds policy max',
        400,
        {'policy': policy, 'maxSizeBytes': max_size_bytes, 'size': size}
    )

def policy_not_found(policy: str) -> FileFnError:
    return FileFnError(ErrorCodes.POLICY_NOT_FOUND, f"Policy '{policy}' not found", 400, {'policy': policy})

def quota_exceeded(current: int, limit: int, requested: int) -> FileFnError:
    return FileFnError(
        ErrorCodes.QUOTA_EXCEEDED,
        'Storage quota exceeded',
        402,
        {'current': current, 'limit': limit, 'requested': requested}
    )

def rate_limited(reset_at: str) -> FileFnError:
    return FileFnError(ErrorCodes.RATE_LIMITED, 'Rate limit exceeded', 429, {'resetAt': reset_at})

def invalid_part_number() -> FileFnError:
    return FileFnError(ErrorCodes.INVALID_PART_NUMBER, 'Invalid partNumber', 400)

def invalid_etag() -> FileFnError:
    return FileFnError(ErrorCodes.INVALID_ETAG, 'Invalid etag', 400)

def upload_incomplete() -> FileFnError:
    return FileFnError(ErrorCodes.UPLOAD_INCOMPLETE, 'Upload incomplete', 409)

def upload_expired() -> FileFnError:
    return FileFnError(ErrorCodes.UPLOAD_EXPIRED, 'Upload session expired', 410)

def upload_aborted() -> FileFnError:
    return FileFnError(ErrorCodes.UPLOAD_ABORTED, 'Upload session was aborted', 410)

def upload_already_completed() -> FileFnError:
    return FileFnError(ErrorCodes.UPLOAD_ALREADY_COMPLETED, 'Upload session already completed', 409)

def idempotency_conflict() -> FileFnError:
    return FileFnError(ErrorCodes.IDEMPOTENCY_CONFLICT, 'Idempotency key reuse with different payload', 409)

def no_supported_upload_mode() -> FileFnError:
    return FileFnError(
        ErrorCodes.NO_SUPPORTED_UPLOAD_MODE,
        'No supported upload mode for configured adapter',
        500
    )

def session_not_found() -> FileFnError:
    return FileFnError(ErrorCodes.SESSION_NOT_FOUND, 'Upload session not found', 404)

def share_expired() -> FileFnError:
    return FileFnError(ErrorCodes.SHARE_EXPIRED, 'Share link has expired', 410)

def share_revoked() -> FileFnError:
    return FileFnError(ErrorCodes.SHARE_REVOKED, 'Share link has been revoked', 410)

def share_downloads_exceeded() -> FileFnError:
    return FileFnError(ErrorCodes.SHARE_DOWNLOADS_EXCEEDED, 'Share link download limit exceeded', 410)

def share_not_found() -> FileFnError:
    return FileFnError(ErrorCodes.SHARE_NOT_FOUND, 'Share link not found', 404)

def permission_not_found() -> FileFnError:
    return FileFnError(ErrorCodes.PERMISSION_NOT_FOUND, 'Permission not found', 404)

def processing_enqueue_failed() -> FileFnError:
    return FileFnError(
        ErrorCodes.PROCESSING_ENQUEUE_FAILED,
        'Failed to enqueue processing',
        503
    )

def part_conflict(upload_session_id: str, part_number: int) -> FileFnError:
    return FileFnError(
        ErrorCodes.PART_CONFLICT,
        'Part already completed with a different etag',
        409,
        {'uploadSessionId': upload_session_id, 'partNumber': part_number}
    )

def upload_size_mismatch(expected: int, actual: int) -> FileFnError:
    return FileFnError(
        ErrorCodes.UPLOAD_SIZE_MISMATCH,
        'Uploaded size does not match expected size',
        409,
        {'expected': expected, 'actual': actual}
    )

def offline_unsupported() -> FileFnError:
    return FileFnError(
        ErrorCodes.OFFLINE_UNSUPPORTED,
        'OPFS unavailable',
        400
    )
