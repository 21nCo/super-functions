import { createExtfnError, type ExtfnError } from '../errors.js';
import {
  assertPayloadWithinLimit,
  mergeManifestPermissions,
  type PermissionMergeInput,
} from './capabilities.js';
import {
  createErrorResponseEnvelope,
  createRequestEnvelope,
  createSuccessResponseEnvelope,
  assertValidRequestEnvelope,
  type RuntimeRequestEnvelope,
  type RuntimeResponseEnvelope,
} from './envelope.js';
import {
  createHandlerNotFoundError,
  createTimeoutError,
} from './errors.js';
import type { BackgroundHandlerDefinition, RuntimeAddress } from '../types.js';

export interface RuntimePlugin {
  id: string;
  dependsOn?: readonly string[];
  contributeManifest?(): PermissionMergeInput['config'] & {
    background?: {
      serviceWorker?: string;
    };
  };
  registerBackgroundHandlers?():
    | readonly BackgroundHandlerDefinition[]
    | Promise<readonly BackgroundHandlerDefinition[] | void>
    | void;
}

export interface RpcClient {
  call<T = unknown>(
    namespace: string,
    method: string,
    payload: unknown,
    target?: Partial<RuntimeAddress>,
    options?: { timeoutMs?: number }
  ): Promise<T>;
}

export interface RegisteredRequestHandler {
  namespace: string;
  method: string;
  handle: BackgroundHandlerDefinition['handle'];
}

export interface CreateRpcClientOptions {
  address: RuntimeAddress;
  runtimeProvider?: () => unknown;
  handlers?: readonly BackgroundHandlerDefinition[];
  plugins?: readonly RuntimePlugin[];
  defaultTimeoutMs?: number;
}

export interface RequestRouterState {
  handlers: readonly RegisteredRequestHandler[];
  pluginOrder: readonly string[];
  mergedPermissions: readonly string[];
}

export function createRpcClient(
  options: CreateRpcClientOptions
): RpcClient & RequestRouterState & {
  dispatch(envelope: RuntimeRequestEnvelope): Promise<RuntimeResponseEnvelope>;
} {
  const pluginOrder = resolvePluginOrder(options.plugins ?? []);
  const mergedContribution = mergePluginContributions(options.plugins ?? []);
  const resolvedHandlers = createRouteTable(
    options.handlers ?? [],
    options.plugins ?? [],
    pluginOrder
  );

  const dispatch = async (
    envelope: RuntimeRequestEnvelope
  ): Promise<RuntimeResponseEnvelope> => {
    try {
      assertValidRequestEnvelope(envelope);
    } catch (error) {
      const extfnError = normalizeToExtfnError(error);
      return createErrorResponseEnvelope(envelope.requestId, extfnError);
    }

    try {
      assertPayloadWithinLimit(envelope.payload);
      const routeKey = `${envelope.namespace}/${envelope.method}`;
      const handler = resolvedHandlers.find(
        (candidate) =>
          candidate.namespace === envelope.namespace &&
          candidate.method === envelope.method
      );

      if (!handler) {
        return createErrorResponseEnvelope(
          envelope.requestId,
          createHandlerNotFoundError(routeKey)
        );
      }

      const timeoutMs = envelope.timeoutMs ?? options.defaultTimeoutMs ?? 30000;
      const result = await withTimeout(
        Promise.resolve(
          handler.handle(
            options.runtimeProvider?.(),
            envelope.payload,
            envelope
          )
        ),
        timeoutMs
      );

      return createSuccessResponseEnvelope(envelope.requestId, result);
    } catch (error) {
      const extfnError = normalizeToExtfnError(error);
      return createErrorResponseEnvelope(envelope.requestId, extfnError);
    }
  };

  return {
    handlers: resolvedHandlers,
    pluginOrder,
    mergedPermissions: mergedContribution.permissions,
    dispatch,
    async call<T>(
      namespace: string,
      method: string,
      payload: unknown,
      target?: Partial<RuntimeAddress>,
      optionsOverrides?: { timeoutMs?: number }
    ): Promise<T> {
      const envelope = createRequestEnvelope({
        requestId: createRequestId(),
        namespace,
        method,
        source: options.address,
        target: {
          context: 'background',
          ...target,
        } as RuntimeAddress,
        payload,
        timeoutMs: optionsOverrides?.timeoutMs,
      });

      const response = await dispatch(envelope);
      if (!response.ok) {
        throw response.error;
      }

      return response.result as T;
    },
  };
}

export function resolvePluginOrder(
  plugins: readonly RuntimePlugin[]
): readonly string[] {
  const pluginMap = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (plugin: RuntimePlugin): void => {
    if (visited.has(plugin.id)) {
      return;
    }
    if (visiting.has(plugin.id)) {
      throw createExtfnError(
        'E_PLUGIN_CONFLICT',
        `Plugin dependency cycle detected: ${plugin.id}`
      );
    }

    visiting.add(plugin.id);
    for (const dependencyId of plugin.dependsOn ?? []) {
      const dependency = pluginMap.get(dependencyId);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.delete(plugin.id);
    visited.add(plugin.id);
    ordered.push(plugin.id);
  };

  for (const plugin of plugins) {
    visit(plugin);
  }

  return ordered;
}

export function mergePluginContributions(
  plugins: readonly RuntimePlugin[]
): {
  permissions: readonly string[];
} {
  const contributions = plugins.map((plugin) => plugin.contributeManifest?.() ?? {});
  const serviceWorkers = contributions
    .map((contribution) => contribution.background?.serviceWorker)
    .filter(Boolean);

  if (serviceWorkers.length > 1) {
    throw createExtfnError(
      'E_PLUGIN_CONFLICT',
      'Conflicting single-owner contribution: background.serviceWorker'
    );
  }

  const merged = mergeManifestPermissions({
    plugins: contributions,
  });

  return {
    permissions: merged.permissions,
  };
}

function createRouteTable(
  baseHandlers: readonly BackgroundHandlerDefinition[],
  plugins: readonly RuntimePlugin[],
  pluginOrder: readonly string[]
): readonly RegisteredRequestHandler[] {
  const orderedPlugins = pluginOrder
    .map((id) => plugins.find((plugin) => plugin.id === id))
    .filter((value): value is RuntimePlugin => Boolean(value));
  const pluginHandlers = orderedPlugins.flatMap((plugin) => {
    const registered = plugin.registerBackgroundHandlers?.();
    if (!registered) {
      return [];
    }

    if (Array.isArray(registered)) {
      return registered;
    }

    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      'Plugin background handlers must be resolved before router creation.'
    );
  });
  const allHandlers = [...baseHandlers, ...pluginHandlers];
  const seen = new Set<string>();

  return allHandlers.map((handler) => {
    if (
      typeof handler.namespace !== 'string' ||
      typeof handler.method !== 'string' ||
      typeof handler.handle !== 'function'
    ) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        'Invalid background handler registration.'
      );
    }

    const routeKey = `${handler.namespace}/${handler.method}`;
    if (seen.has(routeKey)) {
      throw createExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate background handler route: ${routeKey}`
      );
    }
    seen.add(routeKey);

    return {
      namespace: handler.namespace,
      method: handler.method,
      handle: handler.handle,
    };
  });
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function normalizeToExtfnError(error: unknown): ExtfnError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'status' in error &&
    'retryable' in error
  ) {
    return error as ExtfnError;
  }

  return createExtfnError(
    'E_RUNTIME_PROTOCOL',
    error instanceof Error ? error.message : 'Runtime protocol failure.'
  );
}

function createRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}
