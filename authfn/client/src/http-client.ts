import type { AuthFnClientOptions, AuthFnErrorEnvelope } from './types.js';

interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  csrf?: boolean;
}

export function createAuthFnHttpClient(options: AuthFnClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? '/auth').replace(/\/$/, '');
  const credentials = options.credentials ?? 'include';
  const cookieAccessor = options.cookieAccessor ?? defaultCookieAccessor;
  const cookiePrefix = options.cookiePrefix?.trim();
  const resolveBearerToken = async (): Promise<string | undefined> => {
    if (!options.bearerToken) {
      return undefined;
    }
    const token = typeof options.bearerToken === 'function'
      ? await options.bearerToken()
      : options.bearerToken;
    return token?.trim() || undefined;
  };
  const buildTransportError = (error: unknown): AuthFnErrorEnvelope => ({
    ok: false,
    error: {
      code: 'AUTHFN_NETWORK_ERROR',
      message:
        error instanceof Error
          ? error.message
          : 'AuthFn request failed before a response was received',
      retryable: true,
      details:
        error instanceof Error
          ? {
              name: error.name,
              stack: error.stack
            }
          : {
              cause: error
            }
    },
    requestId: 'authfn-transport-error'
  });

  return {
    requestJson: async <T>(request: RequestOptions): Promise<T | AuthFnErrorEnvelope> => {
      const headers = new Headers();
      const url = `${baseUrl}${request.path}`;
      const startedAt = now();

      if (request.body !== undefined) {
        headers.set('content-type', 'application/json');
      }

      let response: Response;
      try {
        const bearerToken = await resolveBearerToken();
        if (bearerToken) {
          headers.set('authorization', `Bearer ${bearerToken}`);
        }

        if (request.csrf) {
          const cookieHeader = cookieAccessor();
          const csrfToken = readCookieValue(
            cookieHeader,
            `${cookiePrefix || readCookiePrefix(cookieHeader)}.csrf`
          );
          if (csrfToken) {
            headers.set('x-authfn-csrf', csrfToken);
          }
        }

        response = await fetchImpl(url, {
          method: request.method,
          headers,
          credentials,
          body: request.body !== undefined ? JSON.stringify(request.body) : undefined
        });
      } catch (error) {
        options.onRequestMetric?.({
          method: request.method,
          path: request.path,
          url,
          ok: false,
          durationMs: now() - startedAt,
          error: error instanceof Error
            ? {
                name: error.name,
                message: error.message
              }
            : {
                message: String(error)
              }
        });
        return buildTransportError(error);
      }

      options.onRequestMetric?.({
        method: request.method,
        path: request.path,
        url,
        status: response.status,
        ok: response.ok,
        durationMs: now() - startedAt,
        requestId: response.headers.get('x-request-id') ?? undefined,
        serverTiming: response.headers.get('server-timing') ?? undefined,
        dbDurationMs: response.headers.get('x-account-db-duration-ms') ?? undefined,
        dbCallCount: response.headers.get('x-account-db-call-count') ?? undefined,
        cacheDurationMs: response.headers.get('x-account-cache-duration-ms') ?? undefined,
        cacheCallCount: response.headers.get('x-account-cache-call-count') ?? undefined,
        lookupDurationMs: response.headers.get('x-account-lookup-duration-ms') ?? undefined,
        lookupCallCount: response.headers.get('x-account-lookup-call-count') ?? undefined,
        workerColo: response.headers.get('x-account-worker-colo') ?? undefined,
        accountRegion: response.headers.get('x-account-region') ?? undefined
      });

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        return {
          ok: false,
          error: {
            code: 'AUTHFN_REDIRECT_REQUIRES_NAVIGATION',
            message: 'Browser clients must use JSON callback mode or navigate directly for redirect-based auth flows',
            retryable: false,
            details: {
              status: response.status,
              redirectTo: response.headers.get('location')
            }
          },
          requestId: response.headers.get('x-request-id') ?? 'authfn-redirect'
        };
      }

      const raw = await response.text();
      if (!raw) {
        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: 'AUTHFN_INTERNAL_ERROR',
              message: `AuthFn returned an empty error response (${response.status})`,
              retryable: response.status >= 500,
              details: {
                status: response.status
              }
            },
            requestId: response.headers.get('x-request-id') ?? 'authfn-empty'
          };
        }

        return {
          ok: true,
          data: {} as Record<string, never>,
          requestId: response.headers.get('x-request-id') ?? 'authfn-empty'
        } as T;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isAuthFnEnvelope(parsed)) {
          return {
            ok: false,
            error: {
              code: 'AUTHFN_INTERNAL_ERROR',
              message: `AuthFn returned an invalid JSON envelope (${response.status})`,
              retryable: response.status >= 500,
              details: {
                status: response.status
              }
            },
            requestId: response.headers.get('x-request-id') ?? 'authfn-invalid-envelope'
          };
        }
        return parsed as T | AuthFnErrorEnvelope;
      } catch {
        return {
          ok: false,
          error: {
            code: 'AUTHFN_INTERNAL_ERROR',
            message: response.ok
              ? 'AuthFn returned a non-JSON response'
              : `AuthFn returned a non-JSON error response (${response.status})`,
            retryable: response.status >= 500,
            details: {
              status: response.status
            }
          },
          requestId: response.headers.get('x-request-id') ?? 'authfn-non-json'
        };
      }
    }
  };
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isAuthFnEnvelope(value: unknown): value is { ok: boolean; requestId: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.ok !== 'boolean' || typeof candidate.requestId !== 'string') {
    return false;
  }

  if (candidate.ok) {
    return 'data' in candidate;
  }

  const error = candidate.error;
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const envelopeError = error as Record<string, unknown>;
  return (
    typeof envelopeError.code === 'string'
    && typeof envelopeError.message === 'string'
    && typeof envelopeError.retryable === 'boolean'
  );
}

function defaultCookieAccessor(): string | undefined {
  const documentLike = globalThis.document as { cookie?: string } | undefined;
  return documentLike?.cookie;
}

function readCookiePrefix(cookieHeader: string | undefined): string {
  if (!cookieHeader) {
    return 'authfn';
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName] = part.trim().split('=');
    if (rawName.startsWith('__Secure-') && rawName.endsWith('.session')) {
      return rawName.slice('__Secure-'.length, -'.session'.length);
    }
    if (rawName.endsWith('.session')) {
      return rawName.slice(0, -'.session'.length);
    }
  }

  return 'authfn';
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...valueParts] = part.trim().split('=');
    if (rawName === name) {
      const rawValue = valueParts.join('=');
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }

  return undefined;
}
