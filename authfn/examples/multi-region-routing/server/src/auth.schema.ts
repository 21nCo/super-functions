import { authFnPlugins, authfn } from 'authfn';
import { authFnMultiRegionPlugin } from '@authfn/multi-region';
import { authFnPasswordPlugin } from '@authfn/password';
import { MULTI_REGION_ROUTING_NAMESPACE } from './auth.js';

export const multiRegionRoutingSchemaSource = authfn({
  namespace: MULTI_REGION_ROUTING_NAMESPACE,
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnMultiRegionPlugin()
  )
});
