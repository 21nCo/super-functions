import {
  createDatafnClient,
  IndexedDbStorageAdapter,
  MemoryStorageAdapter,
  type DatafnClient,
  type DatafnClientConfig,
  type DatafnStorageAdapter,
  type DatafnStorageFactory,
} from "@datafn/client";
import type { DatafnSchema } from "@datafn/core";
import type {
  RuntimeAddress,
} from "extfn";
import type { DatafnExtfnOptions } from "./plugin.js";
import { DatafnExtfnSubscriptions } from "./subscriptions.js";
import {
  assertValidDatafnExtfnOptionShape,
  assertValidRequestEnvelope,
  createErrorResponseEnvelope,
  createEventEnvelope,
  createExtfnLikeError,
  createSuccessResponseEnvelope,
  normalizeExtfnLikeError,
  toProxyId,
  type RuntimeEventEnvelope,
  type RuntimeRequestEnvelope,
  type RuntimeResponseEnvelope,
} from "./shared.js";

type DatafnRpcMethod =
  | "query"
  | "mutation"
  | "transact"
  | "seed"
  | "clone"
  | "pull"
  | "push"
  | "reconcile"
  | "subscribe"
  | "unsubscribe";

export interface BrowserRuntimeLike {
  sendMessage?: (
    message: unknown,
    callback?: (response: unknown) => void,
  ) => Promise<unknown> | void;
  onMessage?: {
    addListener(handler: BrowserRuntimeMessageHandler): void;
    removeListener(handler: BrowserRuntimeMessageHandler): void;
  };
}

type BrowserRuntimeMessageHandler = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

export interface DatafnExtfnRequestContext {
  proxyId: string;
  emitEvent?: (eventEnvelope: RuntimeEventEnvelope) => void | Promise<void>;
}

export interface DatafnExtfnBridge {
  proxyId: string;
  request(envelope: RuntimeRequestEnvelope): Promise<RuntimeResponseEnvelope>;
  onEvent(handler: (eventEnvelope: RuntimeEventEnvelope) => void): () => void;
}

export interface CreateDatafnExtfnAuthorityOptions<S extends DatafnSchema> {
  address?: RuntimeAddress;
  clientFactory?: typeof createDatafnClient<S>;
  storage?: DatafnClientConfig<S>["storage"];
  autoStartSync?: boolean;
}

export interface DatafnExtfnAuthority<S extends DatafnSchema> {
  readonly address: RuntimeAddress;
  readonly client: DatafnClient<S>;
  readonly options: DatafnExtfnOptions<S>;
  readonly subscriptions: DatafnExtfnSubscriptions;
  requestMethod(
    method: DatafnRpcMethod,
    payload: unknown,
    context?: DatafnExtfnRequestContext,
  ): Promise<unknown>;
  handleRequest(
    envelope: RuntimeRequestEnvelope,
    context?: DatafnExtfnRequestContext,
  ): Promise<RuntimeResponseEnvelope>;
  createBridge(proxyId?: string): DatafnExtfnBridge;
  attachBrowserRuntimeBridge(runtime?: BrowserRuntimeLike): () => void;
  destroy(): Promise<void>;
}

export function createDatafnExtfnAuthority<S extends DatafnSchema>(
  options: DatafnExtfnOptions<S>,
  init: CreateDatafnExtfnAuthorityOptions<S> = {},
): DatafnExtfnAuthority<S> {
  assertValidDatafnExtfnOptionShape(options);
  const address = init.address ?? { context: "background" };

  if (address.context !== "background") {
    throw createExtfnLikeError(
      "E_CONTEXT_UNAVAILABLE",
      "DataFn authority mode is only available in background context.",
      {
        context: address.context,
      },
    );
  }

  const clientFactory =
    init.clientFactory ?? (createDatafnClient as typeof createDatafnClient<S>);
  const storage = resolveAuthorityStorage(options, init.storage);
  const sync = {
    offlinability: options.sync?.offlinability ?? true,
    mode:
      options.sync?.mode ??
      (options.sync?.remote || options.sync?.remoteAdapter
        ? "sync"
        : "local-only"),
    ...options.sync,
  } satisfies NonNullable<DatafnClientConfig<S>["sync"]>;
  const client = clientFactory({
    ...options,
    sync,
    storage,
  });
  const subscriptions = new DatafnExtfnSubscriptions({
    subscribe: (handler, filter) => client.subscribe(handler, filter),
  });
  const runtimeBridgeCleanups = new Set<() => void>();

  if (init.autoStartSync && sync.mode === "sync") {
    void client.sync.start();
  }

  const authority: DatafnExtfnAuthority<S> = {
    address,
    client,
    options,
    subscriptions,
    async requestMethod(method, payload, context) {
      switch (method) {
        case "query":
          return client.query(payload);
        case "mutation":
          return client.mutate(payload);
        case "transact":
          return client.transact(payload);
        case "seed":
          return client.sync.seed(payload);
        case "clone":
          return client.sync.clone(payload);
        case "pull":
          return client.sync.pull(payload);
        case "push":
          return client.sync.push(payload);
        case "reconcile":
          await client.sync.reconcileNow();
          return { reconciled: true };
        case "subscribe":
          return handleSubscribeRequest(
            subscriptions,
            address,
            payload,
            context,
          );
        case "unsubscribe":
          return handleUnsubscribeRequest(subscriptions, payload);
        default:
          throw createExtfnLikeError(
            "E_HANDLER_NOT_FOUND",
            `No handler registered for datafn/${method}`,
          );
      }
    },
    async handleRequest(envelope, context) {
      try {
        assertValidRequestEnvelope(envelope);
      } catch (error) {
        return createErrorResponseEnvelope(
          envelope.requestId,
          normalizeExtfnLikeError(error),
        );
      }

      try {
        const result = await authority.requestMethod(
          envelope.method as DatafnRpcMethod,
          envelope.payload,
          context,
        );
        return createSuccessResponseEnvelope(envelope.requestId, result);
      } catch (error) {
        return createErrorResponseEnvelope(
          envelope.requestId,
          normalizeExtfnLikeError(error),
        );
      }
    },
    createBridge(proxyId = `proxy_${Math.random().toString(36).slice(2, 10)}`) {
      const listeners = new Set<(eventEnvelope: RuntimeEventEnvelope) => void>();

      return {
        proxyId,
        request(envelope) {
          return authority.handleRequest(envelope, {
            proxyId,
            emitEvent: async (eventEnvelope) => {
              for (const listener of listeners) {
                listener(eventEnvelope);
              }
            },
          });
        },
        onEvent(handler) {
          listeners.add(handler);
          return () => {
            listeners.delete(handler);
          };
        },
      };
    },
    attachBrowserRuntimeBridge(runtime = resolveBrowserRuntime()) {
      if (!runtime?.onMessage?.addListener) {
        return () => {};
      }

      const listener: BrowserRuntimeMessageHandler = (
        message,
        _sender,
        sendResponse,
      ) => {
        if (!isDatafnRequestEnvelope(message)) {
          return undefined;
        }

        const envelope = message as RuntimeRequestEnvelope;
        const proxyId = toProxyId(envelope.source);

        void authority
          .handleRequest(envelope, {
            proxyId,
            emitEvent: async (eventEnvelope) => {
              await sendBrowserRuntimeMessage(runtime, eventEnvelope);
            },
          })
          .then(sendResponse);

        return true;
      };

      runtime.onMessage.addListener(listener);
      const cleanup = () => {
        runtime.onMessage?.removeListener(listener);
        runtimeBridgeCleanups.delete(cleanup);
      };
      runtimeBridgeCleanups.add(cleanup);
      return cleanup;
    },
    async destroy() {
      for (const cleanup of runtimeBridgeCleanups) {
        cleanup();
      }

      await subscriptions.closeAll();
      await client.destroy();
    },
  };

  return authority;
}

function handleSubscribeRequest(
  subscriptions: DatafnExtfnSubscriptions,
  address: RuntimeAddress,
  payload: unknown,
  context?: DatafnExtfnRequestContext,
): Promise<{ subscriptionId: string; resumed: boolean }> {
  if (!context?.emitEvent) {
    throw createExtfnLikeError(
      "E_CONTEXT_UNAVAILABLE",
      "DataFn subscription fanout requires an active proxy bridge.",
    );
  }

  const input =
    typeof payload === "object" && payload !== null
      ? (payload as {
          filter?: unknown;
          subscriptionId?: string;
        })
      : {};

  return subscriptions.subscribe({
    filter: input.filter as Parameters<DatafnExtfnSubscriptions["subscribe"]>[0]["filter"],
    ...(typeof input.subscriptionId === "string"
      ? { resumeSubscriptionId: input.subscriptionId }
      : {}),
    deliver: async (delivery) => {
      await context.emitEvent?.(
        createEventEnvelope({
          namespace: "datafn",
          event: "subscription",
          source: address,
          payload: delivery,
        }),
      );
    },
  });
}

async function handleUnsubscribeRequest(
  subscriptions: DatafnExtfnSubscriptions,
  payload: unknown,
): Promise<{ unsubscribed: true }> {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { subscriptionId?: unknown }).subscriptionId !== "string"
  ) {
    throw createExtfnLikeError(
      "E_RUNTIME_PROTOCOL",
      "Unsubscribe payload is missing subscriptionId.",
    );
  }

  await subscriptions.unsubscribe(
    (payload as { subscriptionId: string }).subscriptionId,
  );

  return { unsubscribed: true };
}

function resolveAuthorityStorage<S extends DatafnSchema>(
  options: DatafnExtfnOptions<S>,
  override?: DatafnClientConfig<S>["storage"],
): DatafnStorageAdapter | DatafnStorageFactory {
  const configuredStorage = override ?? options.storage;
  if (configuredStorage) {
    if (typeof configuredStorage === "function") {
      if (!options.namespace) {
        throw createExtfnLikeError(
          "E_CONFIG_INVALID",
          "DataFn extfn namespace is required when storage is a factory.",
        );
      }

      return configuredStorage(options.namespace);
    }

    return configuredStorage;
  }

  const namespace = options.namespace ?? options.clientId;
  if (typeof indexedDB !== "undefined") {
    return IndexedDbStorageAdapter.createForNamespace(
      "datafn_extfn",
      namespace,
      undefined,
      options.schema,
    );
  }

  return new MemoryStorageAdapter(options.schema.resources.map((resource) => resource.name));
}

function isDatafnRequestEnvelope(message: unknown): message is RuntimeRequestEnvelope {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "request" &&
    (message as { namespace?: unknown }).namespace === "datafn"
  );
}

function resolveBrowserRuntime(): BrowserRuntimeLike | undefined {
  const globalRuntime = globalThis as {
    browser?: { runtime?: BrowserRuntimeLike };
    chrome?: { runtime?: BrowserRuntimeLike };
  };

  return globalRuntime.browser?.runtime ?? globalRuntime.chrome?.runtime;
}

function sendBrowserRuntimeMessage(
  runtime: BrowserRuntimeLike,
  message: unknown,
): Promise<unknown> {
  if (typeof runtime.sendMessage !== "function") {
    throw createExtfnLikeError(
      "E_CONTEXT_UNAVAILABLE",
      "Browser runtime messaging is unavailable.",
    );
  }
  const sendMessage = runtime.sendMessage.bind(runtime);

  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(normalizeExtfnLikeError(error));
    };

    try {
      if (sendMessage.length >= 2) {
        const maybePromise = sendMessage(message, (response) => {
          resolveOnce(response);
        });
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
          void (maybePromise as Promise<unknown>).then(resolveOnce, rejectOnce);
        }
        return;
      }

      const maybePromise = sendMessage(message);
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
        void (maybePromise as Promise<unknown>).then(resolveOnce, rejectOnce);
        return;
      }

      resolveOnce(undefined);
    } catch (error) {
      rejectOnce(error);
    }
  });
}
