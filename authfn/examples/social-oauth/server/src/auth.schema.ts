import { authFnSocialOAuthPlugin, createAuthFn } from '@authfn/core';
import type { Adapter } from '@superfunctions/db';
import { SOCIAL_OAUTH_NAMESPACE } from './auth.js';

export const socialOAuthSchemaSource = createAuthFn({
  database: {} as Adapter,
  namespace: SOCIAL_OAUTH_NAMESPACE,
  plugins: [
    authFnSocialOAuthPlugin({
      providers: {
        google: {
          clientId: 'demo-google-client',
          clientSecret: 'demo-google-secret',
          allowlistedReturnTo: ['http://127.0.0.1:4012/?provider=google&flow=social']
        },
        github: {
          clientId: 'demo-github-client',
          clientSecret: 'demo-github-secret',
          allowlistedReturnTo: ['http://127.0.0.1:4012/?provider=github&flow=social']
        },
        apple: {
          clientId: 'demo-apple-client',
          clientSecret: 'demo-apple-secret',
          allowlistedReturnTo: ['http://127.0.0.1:4012/?provider=apple&flow=social']
        }
      }
    })
  ]
});
