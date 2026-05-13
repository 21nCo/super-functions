import type { Route } from '@superfunctions/http';
import type {
  AuthFnConfig,
  AuthFnError,
  AuthFnAccountDeletionResult,
  AuthFnHookContext,
  AuthFnHookFailurePolicy,
  AuthFnHooks,
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnSession
} from './types.js';
import { AuthFnError as AuthFnErrorClass, AuthFnPluginAbortedError } from './core/errors.js';
import { emitAuthEvent, eventRequestId } from './core/observability.js';

const BEFORE_HOOK_NAMES = [
  'beforeUserCreate',
  'beforeSessionIssue',
  'beforeChallengeSend',
  'beforeOAuthStart',
  'beforeAccountDelete'
] as const;

const AFTER_HOOK_NAMES = [
  'afterUserCreate',
  'afterSessionIssue',
  'afterChallengeSend',
  'afterOAuthCallback',
  'afterAccountDelete'
] as const;

type BeforeHookName = (typeof BEFORE_HOOK_NAMES)[number];
type AfterHookName = (typeof AFTER_HOOK_NAMES)[number];

export interface AuthFnPluginRunner {
  routes: Route[];
  hooks: Partial<AuthFnHooks>;
}

export function createPluginRuntimeContext(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks> = config.hooks ?? {}
): AuthFnPluginRuntimeContext {
  return {
    config,
    namespace: config.namespace ?? 'authfn',
    basePath: config.basePath ?? '/auth',
    hooks,
    runtimeResolver: config.runtime
  };
}

export function validatePlugins(config: AuthFnConfig): void {
  for (const plugin of config.plugins) {
    plugin.validateConfig?.(config);
  }
}

export function composePluginRoutes(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks> = composePluginHooks(config)
): Route[] {
  const runtimeContext = createPluginRuntimeContext(config, hooks);
  return config.plugins.flatMap((plugin) => plugin.routes?.(runtimeContext) ?? []);
}

export function composePluginHooks(config: AuthFnConfig): Partial<AuthFnHooks> {
  return {
    beforeUserCreate: async (ctx, input) =>
      runBeforeHooks(config.plugins, config, config.hooks, 'beforeUserCreate', ctx, input),
    beforeSessionIssue: async (ctx, input) =>
      runBeforeHooks(config.plugins, config, config.hooks, 'beforeSessionIssue', ctx, input),
    beforeChallengeSend: async (ctx, input) =>
      runBeforeHooks(config.plugins, config, config.hooks, 'beforeChallengeSend', ctx, input),
    beforeOAuthStart: async (ctx, input) =>
      runBeforeHooks(config.plugins, config, config.hooks, 'beforeOAuthStart', ctx, input),
    beforeAccountDelete: async (ctx, input) =>
      runBeforeHooks(config.plugins, config, config.hooks, 'beforeAccountDelete', ctx, input),
    afterUserCreate: async (ctx, user) =>
      runAfterHooks(config.plugins, config, config.hooks, 'afterUserCreate', ctx, user),
    afterSessionIssue: async (ctx, session) =>
      runAfterHooks(config.plugins, config, config.hooks, 'afterSessionIssue', ctx, session),
    afterChallengeSend: async (ctx, result) =>
      runAfterHooks(config.plugins, config, config.hooks, 'afterChallengeSend', ctx, result),
    afterOAuthCallback: async (ctx, result) =>
      runAfterHooks(config.plugins, config, config.hooks, 'afterOAuthCallback', ctx, result),
    afterAccountDelete: async (ctx, result) =>
      runAfterHooks(config.plugins, config, config.hooks, 'afterAccountDelete', ctx, result)
  };
}

export function createPluginRunner(config: AuthFnConfig): AuthFnPluginRunner {
  validatePlugins(config);
  const hooks = composePluginHooks(config);
  return {
    routes: composePluginRoutes(config, hooks),
    hooks
  };
}

async function runBeforeHooks(
  plugins: readonly AuthFnPlugin[],
  config: AuthFnConfig,
  configHooks: Partial<AuthFnHooks> | undefined,
  hookName: BeforeHookName,
  ctx: AuthFnHookContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown> | void> {
  let current: Record<string, unknown> | void = input;
  for (const plugin of plugins) {
    const hook = plugin.hooks?.[hookName];
    if (!hook) {
      continue;
    }

    let result: Record<string, unknown> | void;
    try {
      result = await (
        hook as AuthFnHooks[BeforeHookName]
      )?.({ ...ctx, config: ctx.config, pluginName: plugin.name }, current ?? input);
    } catch (error) {
      await emitAuthEvent(config, {
        type: 'authfn.plugin.failed',
        requestId: eventRequestId(ctx.request),
        actorId: ctx.actorId,
        pluginName: plugin.name,
        hookName,
        outcome: 'aborted',
        metadata: {
          errorCode: readErrorCode(error),
          retriable: readRetryable(error)
        }
      });

      if (isAuthFnError(error)) {
        throw error;
      }

      throw new AuthFnPluginAbortedError(`${plugin.name}.${hookName} aborted authfn execution`, {
        pluginName: plugin.name,
        hookName,
        actorId: ctx.actorId
      });
    }
    if (result !== undefined) {
      current = result;
    }
  }

  const configHook = configHooks?.[hookName];
  if (!configHook) {
    return current;
  }

  let result: Record<string, unknown> | void;
  try {
    result = await (
      configHook as AuthFnHooks[BeforeHookName]
    )?.({ ...ctx, config: ctx.config }, current ?? input);
  } catch (error) {
    await emitAuthEvent(config, {
      type: 'authfn.plugin.failed',
      requestId: eventRequestId(ctx.request),
      actorId: ctx.actorId,
      pluginName: 'config',
      hookName,
      outcome: 'aborted',
      metadata: {
        errorCode: readErrorCode(error),
        retriable: readRetryable(error)
      }
    });

    if (isAuthFnError(error)) {
      throw error;
    }

    throw new AuthFnPluginAbortedError(`config.${hookName} aborted authfn execution`, {
      pluginName: 'config',
      hookName,
      actorId: ctx.actorId
    });
  }
  return result ?? current;
}

async function runAfterHooks(
  plugins: readonly AuthFnPlugin[],
  config: AuthFnConfig,
  configHooks: Partial<AuthFnHooks> | undefined,
  hookName: AfterHookName,
  ctx: AuthFnHookContext,
  payload: Record<string, unknown> | AuthFnSession | AuthFnAccountDeletionResult
): Promise<void> {
  for (const plugin of plugins) {
    const hook = plugin.hooks?.[hookName];
    if (!hook) {
      continue;
    }

    try {
      await hook({ ...ctx, config: ctx.config, pluginName: plugin.name }, payload as never);
    } catch (error) {
      const failurePolicy = getAfterHookFailurePolicy(plugin, hookName);
      await emitAuthEvent(config, {
        type: 'authfn.plugin.failed',
        requestId: eventRequestId(ctx.request),
        actorId: ctx.actorId,
        pluginName: plugin.name,
        hookName,
        outcome: failurePolicy === 'fail' ? 'aborted' : 'observed',
        metadata: {
          errorCode: readErrorCode(error),
          retriable: readRetryable(error)
        }
      });

      if (failurePolicy === 'fail') {
        if (isAuthFnError(error)) {
          throw error;
        }

        throw new AuthFnPluginAbortedError(`${plugin.name}.${hookName} aborted authfn execution`, {
          pluginName: plugin.name,
          hookName,
          actorId: ctx.actorId,
          cause: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const configHook = configHooks?.[hookName];
  if (!configHook) {
    return;
  }

  try {
    await configHook({ ...ctx, config: ctx.config }, payload as never);
  } catch (error) {
    await emitAuthEvent(config, {
      type: 'authfn.plugin.failed',
      requestId: eventRequestId(ctx.request),
      actorId: ctx.actorId,
      pluginName: 'config',
      hookName,
      outcome: 'observed',
      metadata: {
        errorCode: readErrorCode(error),
        retriable: readRetryable(error)
      }
    });
  }
}

function getAfterHookFailurePolicy(
  plugin: AuthFnPlugin,
  hookName: AfterHookName
): AuthFnHookFailurePolicy {
  return plugin.hookFailurePolicy?.[hookName] ?? 'observe';
}

function isAuthFnError(error: unknown): error is AuthFnError {
  if (error instanceof AuthFnErrorClass) {
    return true;
  }

  return Boolean(
    error
      && typeof error === 'object'
      && Object.prototype.hasOwnProperty.call(error, 'code')
      && typeof (error as { code?: unknown }).code === 'string'
      && Object.prototype.hasOwnProperty.call(error, 'status')
      && typeof (error as { status?: unknown }).status === 'number'
  );
}

function readErrorCode(error: unknown): string {
  return isAuthFnError(error) ? error.code : 'AUTHFN_INTERNAL_ERROR';
}

function readRetryable(error: unknown): boolean {
  return isAuthFnError(error) ? Boolean(error.retryable) : false;
}
