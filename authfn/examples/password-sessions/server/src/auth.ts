import { authFnPlugins, authfn, type AuthFnEvent, type AuthFnServer } from 'authfn';
import { authFnPasswordPlugin } from '@authfn/password';
import type { Adapter } from '@superfunctions/db';

export const PASSWORD_SESSIONS_NAMESPACE = 'authfn_password_sessions';
export const PASSWORD_SESSIONS_COOKIE_PREFIX = 'authfn-password-sessions';

export function createPasswordSessionsPlugins() {
  return authFnPlugins(authFnPasswordPlugin());
}

export const passwordSessionsAuthApp = authfn({
  namespace: PASSWORD_SESSIONS_NAMESPACE,
  plugins: createPasswordSessionsPlugins()
});

export const passwordSessionsSchema = passwordSessionsAuthApp.getSchema();

export function createPasswordSessionsAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnServer {
  return passwordSessionsAuthApp.createServer({
    database: options.database,
    environment: {
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
    }
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
