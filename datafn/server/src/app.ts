import type { DatafnPlugin, DatafnSchema } from "@datafn/core";
import { createDatafnServer, type DatafnServer, type DatafnServerConfig } from "./server.js";

/**
 * DataFn app declaration shared by code generation and server runtime.
 */
export interface DatafnAppConfig {
  schema: DatafnSchema;
  plugins?: DatafnPlugin[];
}

/**
 * Runtime server config accepted by DatafnApp.createServer.
 */
export interface DatafnAppServerConfig<TContext = any> extends Omit<DatafnServerConfig<TContext>, "schema" | "plugins"> {
  /** Optional schema override; when omitted, the schema declared in datafn(...) is used. */
  schema?: DatafnSchema;
  /** Runtime plugins merged with declaration-time plugins, replacing plugins with the same identity. */
  plugins?: DatafnPlugin[];
}

/**
 * Side-effect-free DataFn app object that can expose schema or create a server.
 */
export interface DatafnApp {
  readonly schema: DatafnSchema;
  readonly plugins: readonly DatafnPlugin[];
  getSchema(): DatafnSchema;
  /**
   * Creates a DataFn server runtime from the side-effect-free app declaration.
   * The server config supplies persistence, context, authorization, namespace isolation, plugins, limits, hooks, search, and observability.
   */
  createServer<TContext = any>(config: DatafnAppServerConfig<TContext>): Promise<DatafnServer<TContext>>;
}

/**
 * Creates a side-effect-free DataFn app definition for codegen and runtime use.
 */
export function datafn(config: DatafnAppConfig): DatafnApp {
  const plugins = [...(config.plugins ?? [])];

  return {
    schema: config.schema,
    plugins,
    getSchema() {
      return plugins.reduce(
        (schema, plugin) =>
          hasSchemaExtender(plugin) ? plugin.withSchema(schema) : schema,
        config.schema,
      );
    },
    createServer(serverConfig) {
      return createDatafnServer({
        ...serverConfig,
        schema: serverConfig.schema ?? config.schema,
        plugins: mergePlugins(plugins, serverConfig.plugins ?? []),
      });
    },
  };
}

function mergePlugins(
  declarationPlugins: readonly DatafnPlugin[],
  runtimePlugins: readonly DatafnPlugin[],
): DatafnPlugin[] {
  const merged = [...declarationPlugins];
  for (const plugin of runtimePlugins) {
    const existingIndex = merged.findIndex((candidate) =>
      pluginIdentity(candidate) === pluginIdentity(plugin)
    );
    if (existingIndex >= 0) {
      merged[existingIndex] = plugin;
      continue;
    }
    merged.push(plugin);
  }
  return merged;
}

function pluginIdentity(plugin: DatafnPlugin): string {
  const candidate = plugin as DatafnPlugin & { modelName?: unknown };
  return typeof candidate.modelName === "string"
    ? `${plugin.name}:${candidate.modelName}`
    : plugin.name;
}

function hasSchemaExtender(
  plugin: DatafnPlugin,
): plugin is DatafnPlugin & { withSchema(schema: DatafnSchema): DatafnSchema } {
  return "withSchema" in plugin && typeof plugin.withSchema === "function";
}
