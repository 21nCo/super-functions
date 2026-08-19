import type {
  AuthFnPluginRuntimeContext,
  AuthFnRuntimeConfig
} from '../types.js';

type RuntimeConfigSource = AuthFnPluginRuntimeContext | AuthFnRuntimeConfig;

/**
 * Reads typed runtime-only configuration for a bundled AuthFn plugin.
 */
export function readPluginRuntimeConfig<TConfig extends object>(
  source: RuntimeConfigSource,
  pluginName: string
): Partial<TConfig> {
  const config = isRuntimeContext(source) ? source.config : source;
  const value = config.pluginRuntime?.[pluginName];
  return isRecord(value) ? value as Partial<TConfig> : {};
}

function isRuntimeContext(source: RuntimeConfigSource): source is AuthFnPluginRuntimeContext {
  return 'config' in source && 'basePath' in source;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
