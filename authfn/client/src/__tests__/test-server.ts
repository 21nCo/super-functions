import {
  authfn,
  type AuthFnRuntimeConfig,
  type AuthFnServer
} from 'authfn';

export function createTestServer(config: AuthFnRuntimeConfig): AuthFnServer {
  const {
    database,
    cacheStore,
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
    cacheStore,
    environment,
    hooks,
    observability,
    pluginRuntime
  });
}
