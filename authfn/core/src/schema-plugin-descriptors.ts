import { authFnApiKeyPlugin } from './plugins/api-keys.js';
import { authFnEmailOtpPlugin } from './plugins/email-otp.js';
import { authFnPasswordPlugin } from './plugins/email-password.js';
import { authFnMultiRegionPlugin } from './plugins/multi-region.js';
import { authFnNativeHandoffPlugin } from './plugins/native-handoff.js';
import { authFnSchemaPlugin } from './plugins/schema-only.js';
import { authFnSocialOAuthPlugin } from './plugins/social-oauth.js';
import { authFnTwoFactorPlugin } from './plugins/two-factor.js';
import { AuthFnConfigError } from './types.js';
import type {
  AuthFnBundledPluginDescriptor,
  AuthFnPlugin,
  AuthFnSchemaPluginInput
} from './types.js';

type BundledPluginFactory = (...args: unknown[]) => AuthFnPlugin;

const BUNDLED_PLUGIN_FACTORIES: Record<string, BundledPluginFactory> = {
  authFnApiKeyPlugin: (...args) =>
    authFnApiKeyPlugin(args[0] as Parameters<typeof authFnApiKeyPlugin>[0]),
  authFnEmailOtpPlugin: (...args) =>
    authFnEmailOtpPlugin(args[0] as Parameters<typeof authFnEmailOtpPlugin>[0]),
  authFnMultiRegionPlugin: (...args) =>
    authFnMultiRegionPlugin(args[0] as Parameters<typeof authFnMultiRegionPlugin>[0]),
  authFnNativeHandoffPlugin: (...args) =>
    authFnNativeHandoffPlugin(args[0] as Parameters<typeof authFnNativeHandoffPlugin>[0]),
  authFnPasswordPlugin: (...args) =>
    authFnPasswordPlugin(args[0] as Parameters<typeof authFnPasswordPlugin>[0]),
  authFnSchemaPlugin: (...args) =>
    authFnSchemaPlugin(args[0] as Parameters<typeof authFnSchemaPlugin>[0]),
  authFnSocialOAuthPlugin: (...args) =>
    authFnSocialOAuthPlugin(args[0] as Parameters<typeof authFnSocialOAuthPlugin>[0]),
  authFnTwoFactorPlugin: (...args) =>
    authFnTwoFactorPlugin(args[0] as Parameters<typeof authFnTwoFactorPlugin>[0])
};

export function resolveSchemaPluginInputs(
  plugins: readonly AuthFnSchemaPluginInput[]
): AuthFnPlugin[] {
  return plugins.map((plugin) => resolveSchemaPluginInput(plugin));
}

export function resolveSchemaPluginInput(plugin: AuthFnSchemaPluginInput): AuthFnPlugin {
  if (isAuthFnPlugin(plugin)) {
    return plugin;
  }

  if (isBundledPluginDescriptor(plugin)) {
    const originalFactoryName = plugin.__functionCall;
    const normalizedFactoryName = normalizeFactoryName(originalFactoryName);
    const factory = BUNDLED_PLUGIN_FACTORIES[normalizedFactoryName];

    if (!factory) {
      throw new AuthFnConfigError('Unsupported authfn schema plugin descriptor', {
        factoryName: originalFactoryName
      });
    }

    const args = plugin.__args ?? [];
    return factory(...args);
  }

  throw new AuthFnConfigError('Invalid authfn schema plugin input', {
    plugin
  });
}

export function isBundledPluginDescriptor(value: unknown): value is AuthFnBundledPluginDescriptor {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.__functionCall === 'string'
    && (
      !('__args' in candidate)
      || candidate.__args === undefined
      || Array.isArray(candidate.__args)
    )
  );
}

function isAuthFnPlugin(value: unknown): value is AuthFnPlugin {
  return Boolean(
    value
      && typeof value === 'object'
      && 'name' in value
      && typeof value.name === 'string'
  );
}

function normalizeFactoryName(factoryName: string): string {
  const segments = factoryName.trim().split('.');
  return segments[segments.length - 1] ?? factoryName;
}
