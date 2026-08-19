import { authFnPlugins, authfn } from 'authfn';
import { authFnPasswordPlugin } from '@authfn/password';
import { PASSWORD_SESSIONS_NAMESPACE } from './auth.js';

export const passwordSessionsSchemaSource = authfn({
  namespace: PASSWORD_SESSIONS_NAMESPACE,
  plugins: authFnPlugins(
    authFnPasswordPlugin()
  )
});
