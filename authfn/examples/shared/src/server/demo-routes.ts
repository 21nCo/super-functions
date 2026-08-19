import { createRouter, type Router } from '@superfunctions/http';
import type { AuthFnOtpPurpose } from 'authfn';
import type { ExampleEventRecord } from './event-buffer.js';
import type { ExampleOtpMessage } from './otp-inbox.js';

export type ExampleErrorCode =
  | 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN'
  | 'AUTHFN_EXAMPLE_OTP_NOT_FOUND'
  | 'AUTHFN_EXAMPLE_SCENARIO_UNKNOWN'
  | 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING';

export interface ExampleSuccessEnvelope<TData> {
  ok: true;
  data: TData;
  requestId: string;
}

export interface ExampleErrorEnvelope {
  ok: false;
  error: {
    code: ExampleErrorCode | 'AUTHFN_EXAMPLE_INTERNAL_ERROR';
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export interface ExampleResetResult {
  scenario: string;
  seeded: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExampleDemoRouteOptions {
  resetScenario(input: { scenario: string }): Promise<ExampleResetResult> | ExampleResetResult;
  listEvents(): ExampleEventRecord[] | Promise<ExampleEventRecord[]>;
  latestOtp(input: {
    purpose: AuthFnOtpPurpose;
    email: string;
  }): ExampleOtpMessage | undefined | Promise<ExampleOtpMessage | undefined>;
}

export class AuthFnExampleError extends Error {
  readonly code: ExampleErrorCode | 'AUTHFN_EXAMPLE_INTERNAL_ERROR';
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ExampleErrorCode | 'AUTHFN_EXAMPLE_INTERNAL_ERROR',
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'AuthFnExampleError';
    this.code = code;
    this.status = options?.status ?? 500;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export function createDemoRouter(options: ExampleDemoRouteOptions): Router {
  return createRouter({
    routes: [
      {
        method: 'POST',
        path: '/reset',
        handler: async (request) => {
          try {
            const body = await readJsonBody<{ scenario?: string }>(request);
            const scenario = typeof body.scenario === 'string' && body.scenario.length > 0
              ? body.scenario
              : 'baseline';
            const result = await options.resetScenario({ scenario });
            return jsonSuccess(request, result);
          } catch (error) {
            return jsonError(request, error);
          }
        }
      },
      {
        method: 'GET',
        path: '/events',
        handler: async (request) => {
          try {
            const events = await options.listEvents();
            return jsonSuccess(request, {
              events
            });
          } catch (error) {
            return jsonError(request, error);
          }
        }
      },
      {
        method: 'GET',
        path: '/otp/latest',
        handler: async (request, context) => {
          try {
            const purpose = readOtpPurpose(context.query.get('purpose'));
            const email = readRequiredQuery(context.query.get('email'), 'email');
            const latest = await options.latestOtp({
              purpose,
              email
            });

            if (!latest) {
              throw new AuthFnExampleError(
                'AUTHFN_EXAMPLE_OTP_NOT_FOUND',
                'No deterministic OTP found for the requested purpose and email',
                {
                  status: 404,
                  details: {
                    purpose,
                    email
                  }
                }
              );
            }

            return jsonSuccess(request, {
              message: latest
            });
          } catch (error) {
            return jsonError(request, error);
          }
        }
      }
    ]
  });
}

export function resolveDemoRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim();
  if (incoming) {
    return incoming;
  }
  return `req_${Math.random().toString(36).slice(2, 12)}`;
}

export function successEnvelope<TData>(
  requestId: string,
  data: TData
): ExampleSuccessEnvelope<TData> {
  return {
    ok: true,
    data,
    requestId
  };
}

export function errorEnvelope(
  requestId: string,
  error: unknown
): ExampleErrorEnvelope {
  const normalized = normalizeExampleError(error);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      details: normalized.details
    },
    requestId
  };
}

export function jsonSuccess<TData>(request: Request, data: TData, init?: ResponseInit): Response {
  const requestId = resolveDemoRequestId(request);
  return jsonWithHeaders(successEnvelope(requestId, data), requestId, init);
}

export function jsonError(request: Request, error: unknown): Response {
  const requestId = resolveDemoRequestId(request);
  const normalized = normalizeExampleError(error);
  return jsonWithHeaders(errorEnvelope(requestId, normalized), requestId, {
    status: normalized.status
  });
}

function jsonWithHeaders(body: unknown, requestId: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', requestId);
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

function normalizeExampleError(error: unknown): AuthFnExampleError {
  if (error instanceof AuthFnExampleError) {
    return error;
  }

  return new AuthFnExampleError(
    'AUTHFN_EXAMPLE_INTERNAL_ERROR',
    error instanceof Error ? error.message : 'Unknown example server error'
  );
}

async function readJsonBody<T>(request: Request): Promise<T> {
  if (request.headers.get('content-type')?.includes('application/json')) {
    return request.json() as Promise<T>;
  }

  return {} as T;
}

function readRequiredQuery(value: string | null, label: string): string {
  if (!value) {
    throw new AuthFnExampleError(
      'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
      `Missing required query parameter: ${label}`,
      {
        status: 400,
        details: {
          label
        }
      }
    );
  }

  return value;
}

function readOtpPurpose(value: string | null): AuthFnOtpPurpose {
  const purpose = readRequiredQuery(value, 'purpose');
  if (purpose === 'verify-email' || purpose === 'sign-in' || purpose === 'reset-password') {
    return purpose;
  }

  throw new AuthFnExampleError(
    'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
    'Unsupported demo OTP purpose',
    {
      status: 400,
      details: {
        purpose
      }
    }
  );
}
