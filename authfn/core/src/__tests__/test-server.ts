import {
  authfn,
  type AuthFnRuntimeConfig,
  type AuthFnServer
} from '../index.js';

export function createTestServer(config: AuthFnRuntimeConfig): AuthFnServer {
  const {
    database,
    stores,
    environment,
    hooks,
    observability,
    pluginRuntime,
    plugins,
    ...schemaConfig
  } = config;
  return authfn({
    ...schemaConfig,
    plugins
  }).createServer({
    database,
    stores,
    environment,
    hooks,
    observability,
    pluginRuntime
  });
}
