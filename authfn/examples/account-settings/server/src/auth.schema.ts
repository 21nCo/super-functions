import { authFnPlugins, authfn } from 'authfn';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';
import { ACCOUNT_SETTINGS_NAMESPACE } from './auth.js';

export const accountSettingsSchemaSource = authfn({
  namespace: ACCOUNT_SETTINGS_NAMESPACE,
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin()
  )
});
