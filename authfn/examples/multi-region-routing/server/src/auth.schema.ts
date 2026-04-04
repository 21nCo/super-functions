import {
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  createAuthFn
} from '@authfn/core';
import type { Adapter } from '@superfunctions/db';
import {
  MULTI_REGION_EU_BASE_URL,
  MULTI_REGION_ROUTING_NAMESPACE,
  MULTI_REGION_US_BASE_URL
} from './auth.js';

export const multiRegionRoutingSchemaSource = createAuthFn({
  database: {} as Adapter,
  namespace: MULTI_REGION_ROUTING_NAMESPACE,
  plugins: [
    authFnPasswordPlugin(),
    authFnMultiRegionPlugin({
      defaultRegionId: 'us-east-1',
      regions: [
        {
          regionId: 'us-east-1',
          authority: MULTI_REGION_US_BASE_URL,
          cookie: {
            prefix: 'authfn-us'
          }
        },
        {
          regionId: 'eu-west-1',
          authority: MULTI_REGION_EU_BASE_URL,
          cookie: {
            prefix: 'authfn-eu'
          }
        }
      ]
    })
  ]
});
