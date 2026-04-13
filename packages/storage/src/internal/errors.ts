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
