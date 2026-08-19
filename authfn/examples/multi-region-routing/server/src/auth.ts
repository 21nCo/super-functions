import { authFnPlugins, authfn, type AuthFnEvent, type AuthFnServer } from 'authfn';
import { authFnMultiRegionEnvironment, authFnMultiRegionPlugin } from '@authfn/multi-region';
import { authFnPasswordPlugin } from '@authfn/password';
import type { Adapter } from '@superfunctions/db';

export const MULTI_REGION_ROUTING_NAMESPACE = 'authfn_multi_region_routing';
export const MULTI_REGION_US_BASE_URL = 'http://127.0.0.1:4315';
export const MULTI_REGION_EU_BASE_URL = 'http://localhost:4316';
export const MULTI_REGION_USER_EMAIL = 'ada@example.com';
export const MULTI_REGION_USER_PASSWORD = 'Sup3rSecurePassphrase!';

export function createMultiRegionRoutingPlugins() {
  return authFnPlugins(
    authFnPasswordPlugin(),
    authFnMultiRegionPlugin()
  );
}

export const multiRegionRoutingAuthApp = authfn({
  namespace: MULTI_REGION_ROUTING_NAMESPACE,
  plugins: createMultiRegionRoutingPlugins()
});

export const multiRegionRoutingSchema = multiRegionRoutingAuthApp.getSchema();

export function createMultiRegionRoutingAuth(options: {
  database: Adapter;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnServer {
  const multiRegion = createMultiRegionRoutingRuntimeConfig();
  return multiRegionRoutingAuthApp.createServer({
    database: options.database,
    environment: authFnMultiRegionEnvironment(multiRegion),
    observability: {
      emit: options.onEvent
    }
  });
}

function createMultiRegionRoutingRuntimeConfig() {
  return {
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
  };
}
