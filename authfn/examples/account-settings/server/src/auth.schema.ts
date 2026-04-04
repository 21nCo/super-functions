import {
  authFnApiKeyPlugin,
  authFnPasswordPlugin,
  authFnTwoFactorPlugin,
  createAuthFn
} from '@authfn/core';
import type { Adapter } from '@superfunctions/db';
import { ACCOUNT_SETTINGS_NAMESPACE } from './auth.js';

export const accountSettingsSchemaSource = createAuthFn({
  database: {} as Adapter,
  namespace: ACCOUNT_SETTINGS_NAMESPACE,
  plugins: [
    authFnPasswordPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin({
      issuer: 'authfn-account-settings',
      recoveryCodeCount: 3
    })
  ]
});
