import { randomBytes } from 'node:crypto';
import type { AuthFnError, AuthFnErrorEnvelope, AuthFnSuccessEnvelope } from '../types.js';
import { toAuthFnError } from '../core/errors.js';

const requestIds = new WeakMap<Request, string>();

export function resolveRequestId(request: Request): string {
  const cached = requestIds.get(request);
  if (cached) {
    return cached;
  }

  const incoming = request.headers.get('x-request-id')?.trim();
  if (incoming) {
    requestIds.set(request, incoming);
    return incoming;
  }

  const generated = createRequestId();
  requestIds.set(request, generated);
  return generated;
}

export function createRequestId(): string {
  return `req_${randomBytes(8).toString('hex')}`;
}

export function successEnvelope<TData>(
  requestId: string,
  data: TData
): AuthFnSuccessEnvelope<TData> {
  return {
    ok: true,
    data,
    requestId
  };
}

export function errorEnvelope(
  requestId: string,
  error: AuthFnError | unknown
): AuthFnErrorEnvelope {
  const authError = normalizeEnvelopeError(error);

  return {
    ok: false,
    error: {
      code: authError.code,
      message: authError.message,
      retryable: authError.retryable,
      details: authError.details
    },
    requestId
  };
}

export function jsonSuccess<TData>(
  request: Request,
  data: TData,
  init?: ResponseInit & { setCookies?: string[] }
): Response {
  const requestId = resolveRequestId(request);
  return jsonWithHeaders(successEnvelope(requestId, data), requestId, init);
}

export function jsonError(
  request: Request,
  error: unknown
): Response {
  const requestId = resolveRequestId(request);
  const authError = normalizeEnvelopeError(error);
  return jsonWithHeaders(errorEnvelope(requestId, authError), requestId, {
    status: authError.status
  });
}

function normalizeEnvelopeError(
  error: AuthFnError | unknown
): Pick<AuthFnError, 'code' | 'message' | 'retryable' | 'details' | 'status'> {
  if (isAuthFnErrorLike(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: isRecord(error.details) ? error.details : undefined,
      status: normalizeHttpStatus(error.status)
    };
  }

  return toAuthFnError(error);
}

function isAuthFnErrorLike(
  error: unknown
): error is Pick<AuthFnError, 'code' | 'message' | 'retryable' | 'details' | 'status'> {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  return typeof candidate.code === 'string'
    && candidate.code.startsWith('AUTHFN_')
    && typeof candidate.message === 'string'
    && typeof candidate.retryable === 'boolean'
    && (candidate.details === undefined || isRecord(candidate.details))
    && (candidate.status === undefined || typeof candidate.status === 'number');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHttpStatus(status: unknown): number {
  return typeof status === 'number'
    && Number.isInteger(status)
    && status >= 400
    && status <= 599
    ? status
    : 500;
}

function jsonWithHeaders(
  body: unknown,
  requestId: string,
  init?: ResponseInit & { setCookies?: string[] }
): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', requestId);

  for (const cookie of init?.setCookies ?? []) {
    headers.append('set-cookie', cookie);
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}
