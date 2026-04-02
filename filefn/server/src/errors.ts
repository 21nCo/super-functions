export class FileFnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FileFnError';
  }

  get statusCode(): number {
    return this.status;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export const ErrorCodes = {
  AUTH_REQUIRED: 'FILEFN_AUTH_REQUIRED',
  FORBIDDEN: 'FILEFN_FORBIDDEN',
  NOT_FOUND: 'FILEFN_NOT_FOUND',
  POLICY_CONTENT_TYPE_NOT_ALLOWED: 'FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED',
  POLICY_MAX_SIZE_EXCEEDED: 'FILEFN_POLICY_MAX_SIZE_EXCEEDED',
  POLICY_NOT_FOUND: 'FILEFN_POLICY_NOT_FOUND',
  QUOTA_EXCEEDED: 'FILEFN_QUOTA_EXCEEDED',
  RATE_LIMITED: 'FILEFN_RATE_LIMITED',
  INVALID_PART_NUMBER: 'FILEFN_INVALID_PART_NUMBER',
  INVALID_ETAG: 'FILEFN_INVALID_ETAG',
  UPLOAD_INCOMPLETE: 'FILEFN_UPLOAD_INCOMPLETE',
  UPLOAD_EXPIRED: 'FILEFN_UPLOAD_EXPIRED',
  UPLOAD_ABORTED: 'FILEFN_UPLOAD_ABORTED',
  UPLOAD_ALREADY_COMPLETED: 'FILEFN_UPLOAD_ALREADY_COMPLETED',
  IDEMPOTENCY_CONFLICT: 'FILEFN_IDEMPOTENCY_CONFLICT',
  PART_CONFLICT: 'FILEFN_PART_CONFLICT',
  UPLOAD_SIZE_MISMATCH: 'FILEFN_UPLOAD_SIZE_MISMATCH',
  NO_SUPPORTED_UPLOAD_MODE: 'FILEFN_NO_SUPPORTED_UPLOAD_MODE',
  OFFLINE_UNSUPPORTED: 'FILEFN_OFFLINE_UNSUPPORTED',
  SESSION_NOT_FOUND: 'FILEFN_SESSION_NOT_FOUND',
  SHARE_EXPIRED: 'FILEFN_SHARE_EXPIRED',
  SHARE_REVOKED: 'FILEFN_SHARE_REVOKED',
  SHARE_DOWNLOADS_EXCEEDED: 'FILEFN_SHARE_DOWNLOADS_EXCEEDED',
  SHARE_NOT_FOUND: 'FILEFN_SHARE_NOT_FOUND',
  PERMISSION_NOT_FOUND: 'FILEFN_PERMISSION_NOT_FOUND',
  PROCESSING_ENQUEUE_FAILED: 'FILEFN_PROCESSING_ENQUEUE_FAILED',
  INVALID_RENDER_INTENT: 'FILEFN_INVALID_RENDER_INTENT',
  SESSION_TOKEN_REQUIRED: 'FILEFN_SESSION_TOKEN_REQUIRED',
  SESSION_TOKEN_INVALID: 'FILEFN_SESSION_TOKEN_INVALID',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export function authRequired(): FileFnError {
  return new FileFnError(ErrorCodes.AUTH_REQUIRED, 'Authentication required', 401);
}

export function forbidden(details?: Record<string, unknown>): FileFnError {
  return new FileFnError(ErrorCodes.FORBIDDEN, 'Access denied', 403, details);
}

export function notFound(resource: string): FileFnError {
  return new FileFnError(ErrorCodes.NOT_FOUND, `${resource} not found`, 404);
}

export function policyContentTypeNotAllowed(policy: string, mimeType: string): FileFnError {
  return new FileFnError(
    ErrorCodes.POLICY_CONTENT_TYPE_NOT_ALLOWED,
    'Content type not allowed',
    400,
    { policy, mimeType }
  );
}

export function policyMaxSizeExceeded(policy: string, maxSizeBytes: number, size: number): FileFnError {
  return new FileFnError(
    ErrorCodes.POLICY_MAX_SIZE_EXCEEDED,
    'File size exceeds policy max',
    400,
    { policy, maxSizeBytes, size }
  );
}

export function policyNotFound(policy: string): FileFnError {
  return new FileFnError(ErrorCodes.POLICY_NOT_FOUND, `Policy '${policy}' not found`, 400, { policy });
}

export function quotaExceeded(current: number, limit: number, requested: number): FileFnError {
  return new FileFnError(
    ErrorCodes.QUOTA_EXCEEDED,
    'Storage quota exceeded',
    402,
    { current, limit, requested }
  );
}

export function rateLimited(resetAt: string): FileFnError {
  return new FileFnError(ErrorCodes.RATE_LIMITED, 'Rate limit exceeded', 429, { resetAt });
}

export function invalidPartNumber(): FileFnError {
  return new FileFnError(ErrorCodes.INVALID_PART_NUMBER, 'Invalid partNumber', 400);
}

export function invalidEtag(): FileFnError {
  return new FileFnError(ErrorCodes.INVALID_ETAG, 'Invalid etag', 400);
}

export function uploadIncomplete(): FileFnError {
  return new FileFnError(ErrorCodes.UPLOAD_INCOMPLETE, 'Upload incomplete', 409);
}

export function uploadExpired(): FileFnError {
  return new FileFnError(ErrorCodes.UPLOAD_EXPIRED, 'Upload session expired', 410);
}

export function uploadAborted(): FileFnError {
  return new FileFnError(ErrorCodes.UPLOAD_ABORTED, 'Upload session was aborted', 410);
}

export function uploadAlreadyCompleted(): FileFnError {
  return new FileFnError(ErrorCodes.UPLOAD_ALREADY_COMPLETED, 'Upload session already completed', 409);
}

export function idempotencyConflict(): FileFnError {
  return new FileFnError(ErrorCodes.IDEMPOTENCY_CONFLICT, 'Idempotency key reuse with different payload', 409);
}

export function noSupportedUploadMode(): FileFnError {
  return new FileFnError(
    ErrorCodes.NO_SUPPORTED_UPLOAD_MODE,
    'No supported upload mode for configured adapter',
    500
  );
}

export function sessionNotFound(): FileFnError {
  return new FileFnError(ErrorCodes.SESSION_NOT_FOUND, 'Upload session not found', 404);
}

export function shareExpired(): FileFnError {
  return new FileFnError(ErrorCodes.SHARE_EXPIRED, 'Share link has expired', 410);
}

export function shareRevoked(): FileFnError {
  return new FileFnError(ErrorCodes.SHARE_REVOKED, 'Share link has been revoked', 410);
}

export function shareDownloadsExceeded(): FileFnError {
  return new FileFnError(ErrorCodes.SHARE_DOWNLOADS_EXCEEDED, 'Share link download limit exceeded', 410);
}

export function shareNotFound(): FileFnError {
  return new FileFnError(ErrorCodes.SHARE_NOT_FOUND, 'Share link not found', 404);
}

export function permissionNotFound(): FileFnError {
  return new FileFnError(ErrorCodes.PERMISSION_NOT_FOUND, 'Permission not found', 404);
}

export function sessionTokenRequired(): FileFnError {
  return new FileFnError(
    ErrorCodes.SESSION_TOKEN_REQUIRED,
    'Upload session token required',
    401
  );
}

export function sessionTokenInvalid(): FileFnError {
  return new FileFnError(
    ErrorCodes.SESSION_TOKEN_INVALID,
    'Invalid upload session token',
    403
  );
}

export function processingEnqueueFailed(): FileFnError {
  return new FileFnError(
    ErrorCodes.PROCESSING_ENQUEUE_FAILED,
    'Failed to enqueue processing',
    503
  );
}

export function invalidRenderIntent(intent?: string): FileFnError {
  return new FileFnError(
    ErrorCodes.INVALID_RENDER_INTENT,
    'Invalid render intent',
    400,
    { intent }
  );
}

export function partConflict(uploadSessionId: string, partNumber: number): FileFnError {
  return new FileFnError(
    ErrorCodes.PART_CONFLICT,
    'Part already completed with a different etag',
    409,
    { uploadSessionId, partNumber }
  );
}

export function uploadSizeMismatch(expected: number, actual: number): FileFnError {
  return new FileFnError(
    ErrorCodes.UPLOAD_SIZE_MISMATCH,
    'Uploaded size does not match expected size',
    409,
    { expected, actual }
  );
}

export function offlineUnsupported(): FileFnError {
  return new FileFnError(
    ErrorCodes.OFFLINE_UNSUPPORTED,
    'OPFS unavailable',
    400
  );
}
