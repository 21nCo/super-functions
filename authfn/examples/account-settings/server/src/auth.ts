import {
  authFnApiKeyPlugin,
  authFnPasswordPlugin,
  authFnTwoFactorPlugin,
  createAuthFn,
  getSchema,
  type AuthFnEvent,
  type AuthFnInstance,
  type AuthFnPlugin
} from '@authfn/core';
import type { Adapter } from '@superfunctions/db';

export const ACCOUNT_SETTINGS_NAMESPACE = 'authfn_account_settings';
export const ACCOUNT_SETTINGS_COOKIE_PREFIX = 'authfn-account-settings';

export function createAccountSettingsSchemaPlugins(): AuthFnPlugin[] {
  return [
    authFnPasswordPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin({
      issuer: 'authfn-account-settings',
      recoveryCodeCount: 3
    })
  ];
}

export function createAccountSettingsPlugins(): AuthFnPlugin[] {
  return [
    authFnPasswordPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin({
      issuer: 'authfn-account-settings',
      recoveryCodeCount: 3
    })
  ];
}

export const accountSettingsSchema = getSchema({
  database: {} as Adapter,
  namespace: ACCOUNT_SETTINGS_NAMESPACE,
  plugins: createAccountSettingsSchemaPlugins()
});

export function createAccountSettingsAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnInstance {
  return createAuthFn({
    database: options.database,
    namespace: ACCOUNT_SETTINGS_NAMESPACE,
    runtime: {
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
      emit: options.onEvent
    },
    plugins: createAccountSettingsPlugins()
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
