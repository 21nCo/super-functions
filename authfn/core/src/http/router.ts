import { createRouter, type Route, type Router } from '@superfunctions/http';
import type { AuthFnConfig, AuthFnHooks } from '../types.js';
import { AuthFnNotImplementedError } from '../core/errors.js';
import { AuthFnValidationError } from '../core/errors.js';
import { clearSessionCookies, issueSessionCookies } from '../core/cookies.js';
import {
  assertValidCsrf,
  getCookieSessionState,
  listActiveSessionsForUser,
  requireCookieSession,
  revokeSessionById,
  revokeSessionsForUser
} from '../core/sessions.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';
import { jsonError, jsonSuccess } from './envelopes.js';

export function createAuthFnRouter(
  config: AuthFnConfig,
  _hooks: Partial<AuthFnHooks>,
  pluginRoutes: Route[]
): Router {
  return createRouter({
    basePath: config.basePath ?? '/auth',
    routes: [...createBaseRoutes(config, _hooks), ...pluginRoutes],
    onError: async (error, request) => jsonError(request, error)
  });
}

export function createBaseRoutes(
  config: AuthFnConfig,
  _hooks: Partial<AuthFnHooks>
): Route[] {
  return [
    {
      method: 'GET',
      path: '/session',
      meta: createAuthFnRouteMeta('getSession', 'Get the current cookie session', {
        mode: 'cookie-session'
      }),
      handler: async (request) => {
        const state = await getCookieSessionState(config, request);
        const cookiesToClear = state.failureReason
          ? Object.values(clearSessionCookies(state.cookiePolicy))
          : [];

        return jsonSuccess(request, {
          session: state.session ?? null
        }, {
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
