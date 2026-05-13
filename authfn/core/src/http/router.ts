import { createRouter, type Route, type Router } from '@superfunctions/http';
import type { AuthFnConfig, AuthFnHooks } from '../types.js';
import { AuthFnNotImplementedError, AuthFnUnauthenticatedError } from '../core/errors.js';
import { AuthFnValidationError } from '../core/errors.js';
import { clearSessionCookies, issueSessionCookies } from '../core/cookies.js';
import {
  assertValidCsrf,
  authenticateRequest,
  getCookieSessionState,
  listActiveSessionsForUser,
  requireCookieSession,
  revokeSessionById,
  revokeSessionsForUser
} from '../core/sessions.js';
import { deleteAccountForUser, getAccountDetailsForUser } from '../core/account.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';
import { findUserById } from '../core/users.js';
import { jsonError, jsonSuccess } from './envelopes.js';

export function createAuthFnRouter(
  config: AuthFnConfig,
  _hooks: Partial<AuthFnHooks>,
  pluginRoutes: Route[]
): Router {
  return createRouter({
    basePath: config.basePath ?? '/auth',
    routes: [...createBaseRoutes(config, _hooks), ...pluginRoutes],
    onError: async (error, request) => {
      const metadata = sanitizeErrorMetadata(describeRouteError(error, request));
      if (isDebugErrorLoggingEnabled()) {
        console.error('[authfn route error]', JSON.stringify(metadata));
      }
      try {
        await emitAuthEvent(config, {
          type: 'authfn.request.failed',
          requestId: eventRequestId(request),
          outcome: 'error',
          metadata
        });
      } catch {
        // Error handling must still return the original auth response.
      }

      return jsonError(request, error);
    }
  });
}

function isDebugErrorLoggingEnabled(): boolean {
  const globalProcess = globalThis as unknown as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };
  return globalProcess.process?.env?.AUTHFN_DEBUG_ERRORS === 'true';
}

function describeRouteError(error: unknown, request: Request): Record<string, unknown> {
  const raw = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {};
  const cause = raw.cause;

  return {
    method: request.method,
    path: new URL(request.url).pathname,
    name: error instanceof Error ? error.name : typeof error,
    errorKind: typeof raw.code === 'string' ? raw.code : undefined,
    message: error instanceof Error ? error.message : String(error),
    status: typeof raw.status === 'number' ? raw.status : undefined,
    retryable: typeof raw.retryable === 'boolean' ? raw.retryable : undefined,
    details: isRecord(raw.details) ? raw.details : undefined,
    cause: cause instanceof Error
      ? {
          name: cause.name,
          message: cause.message
        }
      : typeof cause === 'string'
        ? cause
        : undefined
  };
}

export function createBaseRoutes(
  config: AuthFnConfig,
  _hooks: Partial<AuthFnHooks>
): Route[] {
  return [
    {
      method: 'GET',
      path: '/session',
      meta: createAuthFnRouteMeta('getSession', 'Get the current session', {
        mode: 'hybrid'
      }),
      handler: async (request) => {
        const state = await getCookieSessionState(config, request);
        const cookiesToClear = state.failureReason
          ? Object.values(clearSessionCookies(state.cookiePolicy))
          : [];
        const session = state.session ?? await authenticateRequest(config, request);

        return jsonSuccess(request, {
          session: session?.type === 'session' && session.actorType === 'user'
            ? session
            : null
        }, {
          setCookies: cookiesToClear
        });
      }
    },
    {
      method: 'GET',
      path: '/account',
      meta: createAuthFnRouteMeta('getAccountDetails', 'Get current user account details', {
        mode: 'hybrid'
      }),
      handler: async (request) => {
        const session = await authenticateRequest(config, request);
        if (!session || session.type !== 'session' || session.actorType !== 'user') {
          throw new AuthFnUnauthenticatedError();
        }

        const user = await findUserById(config, session.actorId);
        if (!user) {
          throw new AuthFnUnauthenticatedError('Authenticated user no longer exists');
        }

        const account = await getAccountDetailsForUser(config, user);
        return jsonSuccess(request, {
          ...account,
          regionId: session.regionId
        });
      }
    },
    {
      method: 'DELETE',
      path: '/account',
      meta: createAuthFnRouteMeta('deleteAccount', 'Delete the current user account', {
        mode: 'hybrid',
        csrf: true
      }),
      handler: async (request) => {
        const cookieState = await getCookieSessionState(config, request);
        let session = cookieState.session ?? null;

        if (session) {
          assertValidCsrf(request, cookieState);
        } else {
          session = await authenticateRequest(config, request);
        }

        if (!session || session.type !== 'session' || session.actorType !== 'user') {
          throw new AuthFnUnauthenticatedError();
        }

        const user = await findUserById(config, session.actorId);
        if (!user) {
          throw new AuthFnUnauthenticatedError('Authenticated user no longer exists');
        }

        const deletion = await deleteAccountForUser(config, _hooks, {
          user,
          session,
          request
        });
        const cookiesToClear = cookieState.session || cookieState.failureReason
          ? Object.values(clearSessionCookies(cookieState.cookiePolicy))
          : [];

        return jsonSuccess(request, deletion, {
          setCookies: cookiesToClear
        });
      }
    },
    {
      method: 'GET',
      path: '/sessions',
      meta: createAuthFnRouteMeta('listSessions', 'List active sessions for the current user', {
        mode: 'cookie-session'
      }),
      handler: async (request) => {
        const state = await requireCookieSession(config, request);
        const sessions = await listActiveSessionsForUser(config, state.user, {
          regionId: state.runtime.regionId
        });

        return jsonSuccess(request, {
          sessions,
          currentSessionId: state.session.id
        });
      }
    },
    {
      method: 'POST',
      path: '/sign-out',
      meta: createAuthFnRouteMeta('signOut', 'Revoke the current session', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const state = await getCookieSessionState(config, request);
        const body = await readOptionalJson<{ allSessions?: boolean }>(request);

        if (!state.session || !state.sessionRecord || !state.user) {
          const cookies = Object.values(clearSessionCookies(state.cookiePolicy));
          return jsonSuccess(request, {
            revoked: false,
            allSessions: Boolean(body.allSessions)
          }, {
            setCookies: cookies
          });
        }

        assertValidCsrf(request, state);

        if (body.allSessions) {
          await revokeSessionsForUser(config, state.user.id);
        } else {
          await revokeSessionById(config, state.session.id, {
            userId: state.user.id
          });
        }

        await emitAuthEvent(config, {
          type: 'authfn.session.revoked',
          requestId: eventRequestId(request),
          actorId: state.user.id,
          sessionId: body.allSessions ? undefined : state.session.id,
          userId: state.user.id,
          regionId: state.session.regionId,
          outcome: body.allSessions ? 'revoked-all' : 'revoked-current',
          metadata: {
            allSessions: Boolean(body.allSessions)
          }
        });

        const cookies = Object.values(clearSessionCookies(state.cookiePolicy));
        return jsonSuccess(request, {
          revoked: true,
          allSessions: Boolean(body.allSessions)
        }, {
          setCookies: cookies
        });
      }
    },
    {
      method: 'POST',
      path: '/sessions/:sessionId/revoke',
      meta: createAuthFnRouteMeta('revokeSession', 'Revoke a specific session', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request, context) => {
        const state = await requireCookieSession(config, request);
        assertValidCsrf(request, state);

        await revokeSessionById(config, context.params.sessionId, {
          userId: state.user.id
        });

        await emitAuthEvent(config, {
          type: 'authfn.session.revoked',
          requestId: eventRequestId(request),
          actorId: state.user.id,
          sessionId: context.params.sessionId,
          userId: state.user.id,
          regionId: state.session.regionId,
          outcome: 'revoked-specific'
        });

        const cookies = context.params.sessionId === state.session.id
          ? Object.values(clearSessionCookies(state.cookiePolicy))
          : [];

        return jsonSuccess(request, {
          revoked: true,
          sessionId: context.params.sessionId
        }, {
          setCookies: cookies
        });
      }
    }
  ];
}

export function createPlaceholderRoute(
  method: Route['method'],
  path: string,
  operationId: string
): Route {
  return {
    method,
    path,
    meta: createAuthFnRouteMeta(operationId, `Placeholder route for ${path}`, {
      mode: method === 'GET' ? 'none' : 'cookie-session',
      csrf: method !== 'GET'
    }),
    handler: async (request) =>
      jsonError(
        request,
        new AuthFnNotImplementedError('This authfn route is not implemented in the current phase', {
          operationId
        })
      )
  };
}

export function cookieNamesForRequest(config: AuthFnConfig, request: Request): Promise<{
  sessionCookieName: string;
  csrfCookieName: string;
}> {
  return getCookieSessionState(config, request).then((state) => ({
    sessionCookieName: state.cookiePolicy.sessionCookieName,
    csrfCookieName: state.cookiePolicy.csrfCookieName
  }));
}

export function issueCookiesForRequest(
  config: AuthFnConfig,
  request: Request,
  sessionToken: string,
  csrfToken: string
): Promise<string[]> {
  return getCookieSessionState(config, request).then((state) =>
    Object.values(issueSessionCookies(state.cookiePolicy, sessionToken, csrfToken))
  );
}

export function createAuthFnRouteMeta(
  operationId: string,
  summary: string,
  auth: { mode: 'none' | 'cookie-session' | 'bearer' | 'hybrid'; csrf?: boolean }
): Route['meta'] {
  return {
    auth,
    openapi: {
      operationId,
      summary,
      tags: ['authfn']
    }
  };
}

export async function readOptionalJson<T extends Record<string, unknown>>(
  request: Request
): Promise<T> {
  const raw = await request.text();
  if (!raw) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new AuthFnValidationError('Request body must be valid JSON', {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const SENSITIVE_ERROR_METADATA_KEY = /(authorization|cookie|password|secret|token|code|hash|access|refresh|idtoken|clientsecret)/i;

function sanitizeErrorMetadata(value: unknown, key?: string): Record<string, unknown> {
  const sanitized = sanitizeErrorMetadataValue(value, key, new WeakSet<object>());
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeErrorMetadataValue(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>
): unknown {
  if (key && SENSITIVE_ERROR_METADATA_KEY.test(key)) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const sanitized = value.map((entry) => sanitizeErrorMetadataValue(entry, undefined, seen));
    seen.delete(value);
    return sanitized;
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const sanitized = Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeErrorMetadataValue(entryValue, entryKey, seen)
      ])
    );
    seen.delete(value);
    return sanitized;
  }
  return value;
}
