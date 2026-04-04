import {
  authFnPasswordPlugin,
  createAuthFn,
  getSchema,
  type AuthFnEvent,
  type AuthFnInstance,
  type AuthFnPlugin
} from '@authfn/core';
import type { Adapter } from '@superfunctions/db';

export const PASSWORD_SESSIONS_NAMESPACE = 'authfn_password_sessions';
export const PASSWORD_SESSIONS_COOKIE_PREFIX = 'authfn-password-sessions';

export function createPasswordSessionsPlugins(): AuthFnPlugin[] {
  return [authFnPasswordPlugin()];
}

export const passwordSessionsSchema = getSchema({
  database: {} as Adapter,
  namespace: PASSWORD_SESSIONS_NAMESPACE,
  plugins: createPasswordSessionsPlugins()
});

export function createPasswordSessionsAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnInstance {
  return createAuthFn({
    database: options.database,
    namespace: PASSWORD_SESSIONS_NAMESPACE,
    runtime: {
      resolve(request) {
        const url = new URL(request.url);
        return {
          issuer: url.origin,
          baseUrl: url.origin,
          cookie: {
            prefix: PASSWORD_SESSIONS_COOKIE_PREFIX,
            secure: !isLocalHostname(url.hostname),
            sameSite: 'lax'
          }
        };
      }
    },
    observability: {
      emit: options.onEvent
    },
    plugins: createPasswordSessionsPlugins()
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
