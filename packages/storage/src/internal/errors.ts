export function createStorageError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function createNotFoundError(message = 'Object not found'): Error & { code: string } {
  return createStorageError(message, 'STORAGE_NOT_FOUND');
}

export function createMultipartInvalidError(message = 'No parts provided'): Error & { code: string } {
  return createStorageError(message, 'STORAGE_MULTIPART_INVALID');
}

export function assertMultipartParts(
  parts: Array<{ partNumber: number; etag: string }>
): void {
  if (parts.length === 0) {
    throw createMultipartInvalidError();
  }
}

/** Upper bound for presigned URL lifetimes: 7 days, the AWS SigV4 maximum. */
export const MAX_SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/**
 * Validate a presigned-URL expiry (in seconds). Rejects non-positive, non-finite
 * and out-of-range values so a caller bug or malicious input cannot mint URLs
 * that never expire (or are already expired).
 */
export function assertValidSignedUrlExpiry(
  expiresInSeconds: number,
  maxSeconds: number = MAX_SIGNED_URL_EXPIRY_SECONDS
): void {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    throw createStorageError(
      'Signed URL maximum expiry must be a positive finite number of seconds',
      'STORAGE_SIGNED_URL_EXPIRY_INVALID'
    );
  }
  const effectiveMaxSeconds = Math.min(maxSeconds, MAX_SIGNED_URL_EXPIRY_SECONDS);
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw createStorageError(
      'Signed URL expiry must be a positive integer number of seconds',
      'STORAGE_SIGNED_URL_EXPIRY_INVALID'
    );
  }
  if (expiresInSeconds > effectiveMaxSeconds) {
    throw createStorageError(
      `Signed URL expiry must not exceed ${effectiveMaxSeconds} seconds`,
      'STORAGE_SIGNED_URL_EXPIRY_INVALID'
    );
  }
}

export function isNotFoundError(
  error: unknown,
  options?: {
    names?: string[];
    statusCode?: number;
    numericCodes?: number[];
    stringCodes?: string[];
  }
): boolean {
  const err = error as
    | { name?: string; code?: string | number; statusCode?: number; $metadata?: { httpStatusCode?: number } }
    | undefined;

  if (!err) {
    return false;
  }

  if (options?.names?.includes(err.name ?? '')) {
    return true;
  }

  if (options?.statusCode !== undefined) {
    if (err.statusCode === options.statusCode || err.$metadata?.httpStatusCode === options.statusCode) {
      return true;
    }
  }

  if (typeof err.code === 'number' && options?.numericCodes?.includes(err.code)) {
    return true;
  }

  if (typeof err.code === 'string' && options?.stringCodes?.includes(err.code)) {
    return true;
  }

  return false;
}
