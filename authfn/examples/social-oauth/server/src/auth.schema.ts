import { authFnPlugins, authfn } from 'authfn';
import { authFnSocialOAuthPlugin } from '@authfn/social-oauth';
import { SOCIAL_OAUTH_NAMESPACE } from './auth.js';

export const socialOAuthSchemaSource = authfn({
  namespace: SOCIAL_OAUTH_NAMESPACE,
  plugins: authFnPlugins(
    authFnSocialOAuthPlugin()
  )
});
