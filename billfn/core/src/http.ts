import { err, ok, type Envelope } from '@superfunctions/envelope';
import type { SuperfunctionError } from '@superfunctions/errors';

export function jsonResponse<T>(body: Envelope<T>, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export function successResponse<T>(data: T, status: number = 200): Response {
  return jsonResponse(ok(data), status);
}

export function errorResponse(error: Error): Response {
  if (isSuperfunctionError(error)) {
    return jsonResponse(
      err({
        code: error.code,
        message: error.message,
        status: error.status,
        retryable: error.retryable,
        details: error.details
      }),
      error.status
    );
  }

  return jsonResponse(
    err({
      code: 'BILLFN_INTERNAL_ERROR',
      message: 'Unexpected billfn error',
      status: 500,
      retryable: false
    }),
    500
  );
}

function isSuperfunctionError(value: Error): value is SuperfunctionError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { status?: unknown }).status === 'number' &&
    typeof (value as { retryable?: unknown }).retryable === 'boolean'
  );
}
