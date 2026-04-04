import {
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  createAuthFn,
  getSchema,
  type AuthFnEvent,
  type AuthFnInstance,
  type AuthFnPlugin
} from '@authfn/core';
import type { Adapter } from '@superfunctions/db';

export const MULTI_REGION_ROUTING_NAMESPACE = 'authfn_multi_region_routing';
export const MULTI_REGION_US_BASE_URL = 'http://127.0.0.1:4315';
export const MULTI_REGION_EU_BASE_URL = 'http://localhost:4316';
export const MULTI_REGION_USER_EMAIL = 'ada@example.com';
export const MULTI_REGION_USER_PASSWORD = 'Sup3rSecurePassphrase!';

export function createMultiRegionRoutingSchemaPlugins(): AuthFnPlugin[] {
  return [
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
  ];
}

export const multiRegionRoutingSchema = getSchema({
  database: {} as Adapter,
  namespace: MULTI_REGION_ROUTING_NAMESPACE,
  plugins: createMultiRegionRoutingSchemaPlugins()
});

export function createMultiRegionRoutingAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnInstance {
  return createAuthFn({
    database: options.database,
    namespace: MULTI_REGION_ROUTING_NAMESPACE,
    runtime: {
      resolve(request) {
        const url = new URL(request.url);
        const isEu = url.port === '4316';
        return {
          issuer: url.origin,
          baseUrl: url.origin,
          regionId: isEu ? 'eu-west-1' : 'us-east-1',
          cookie: {
            prefix: isEu ? 'authfn-eu' : 'authfn-us',
            secure: false,
            sameSite: 'lax'
          }
        };
      }
    },
    observability: {
      emit: options.onEvent
    },
    plugins: createMultiRegionRoutingSchemaPlugins()
  });
}
