import { authFnPasswordPlugin, createAuthFn } from '@authfn/core';
import type { Adapter } from '@superfunctions/db';
import { PASSWORD_SESSIONS_NAMESPACE } from './auth.js';

export const passwordSessionsSchemaSource = createAuthFn({
  database: {} as Adapter,
  namespace: PASSWORD_SESSIONS_NAMESPACE,
  plugins: [
    authFnPasswordPlugin()
  ]
});
