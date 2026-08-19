import { authFnPlugins, authfn, type AuthFnEvent, type AuthFnServer } from 'authfn';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';
import type { Adapter } from '@superfunctions/db';

export const ACCOUNT_SETTINGS_NAMESPACE = 'authfn_account_settings';
export const ACCOUNT_SETTINGS_COOKIE_PREFIX = 'authfn-account-settings';

export function createAccountSettingsPlugins() {
  return authFnPlugins(
    authFnPasswordPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin()
  );
}

export const accountSettingsAuthApp = authfn({
  namespace: ACCOUNT_SETTINGS_NAMESPACE,
  plugins: createAccountSettingsPlugins()
});

export const accountSettingsSchema = accountSettingsAuthApp.getSchema();

export function createAccountSettingsAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnServer {
  return accountSettingsAuthApp.createServer({
    database: options.database,
    environment: {
      resolve(request) {
        const url = new URL(request.url);
        return {
          issuer: url.origin,
          baseUrl: url.origin,
          cookie: {
            prefix: ACCOUNT_SETTINGS_COOKIE_PREFIX,
            secure: !isLocalHostname(url.hostname),
            sameSite: 'lax'
          }
        };
      }
    },
    observability: {
      events: options.onEvent
    },
    pluginRuntime: {
      twoFactor: {
        issuer: 'authfn-account-settings',
        recoveryCodeCount: 3
      }
    }
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
