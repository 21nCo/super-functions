import {
  createDatafnClient,
  createExtensionTransport,
  type DatafnClient,
} from "@datafn/client";
import type {
  DatafnRpcRequest,
  DatafnRpcResponse,
  MessageBus,
} from "@datafn/client";
import type { DatafnSchema } from "@datafn/core";
import type { RuntimeAddress } from "extfn";
import type {
  BrowserRuntimeLike,
  DatafnExtfnBridge,
} from "./authority.js";
import type { DatafnExtfnOptions } from "./plugin.js";
import {
  assertValidDatafnExtfnOptionShape,
  createExtfnLikeError,
  createRequestEnvelope,
  normalizeExtfnLikeError,
  type RuntimeEventEnvelope,
  type RuntimeResponseEnvelope,
} from "./shared.js";

export interface DatafnExtfnProxyClientOptions {
  bridge?: DatafnExtfnBridge;
  address?: RuntimeAddress;
  browserRuntime?: BrowserRuntimeLike;
}

export function createDatafnExtfnProxyClient<S extends DatafnSchema>(
  options: DatafnExtfnOptions<S>,
  runtimeOptions: DatafnExtfnProxyClientOptions = {},
): DatafnClient<S> {
  assertValidDatafnExtfnOptionShape(options);
  const bridge =
    runtimeOptions.bridge ??
    createBrowserDatafnExtfnBridge({
      address: runtimeOptions.address ?? { context: "popup" },
      browserRuntime: runtimeOptions.browserRuntime,
    });
  const transport = createExtensionTransport(
    createMessageBus(bridge, runtimeOptions.address ?? { context: "popup" }),
    {
      timeout: options.requestTimeoutMs,
    },
  );

  return createDatafnClient({
    ...options,
    sync: {
      ...options.sync,
      mode: "sync",
      remoteAdapter: transport,
    },
  });
}

export function createBrowserDatafnExtfnBridge(options: {
  address: RuntimeAddress;
  browserRuntime?: BrowserRuntimeLike;
}): DatafnExtfnBridge {
  const browserRuntime = options.browserRuntime ?? resolveBrowserRuntime();
  if (!browserRuntime) {
    throw createExtfnLikeError(
      "E_CONTEXT_UNAVAILABLE",
      "Browser runtime messaging is unavailable.",
    );
  }

  return {
    proxyId: createBrowserProxyId(options.address),
    async request(envelope) {
      const response = await sendBrowserRuntimeMessage(browserRuntime, envelope);
      return normalizeRuntimeResponse(response, envelope.requestId);
    },
    onEvent(handler) {
      if (!browserRuntime.onMessage?.addListener) {
        return () => {};
      }

      const listener = (message: unknown) => {
        if (isDatafnEventEnvelope(message)) {
          handler(message);
        }
      };
      browserRuntime.onMessage.addListener(listener as never);
      return () => {
        browserRuntime.onMessage?.removeListener(listener as never);
      };
    },
  };
}

function createMessageBus(
  bridge: DatafnExtfnBridge,
  address: RuntimeAddress,
): MessageBus {
  const listeners = new Set<(message: unknown) => void>();
  bridge.onEvent((eventEnvelope) => {
    const payload = eventEnvelope.payload as {
      subscriptionId?: string;
      event?: unknown;
    };

    if (
      typeof payload.subscriptionId === "string" &&
      "event" in payload
    ) {
      const eventMessage = {
        type: "event",
        subscriptionId: payload.subscriptionId,
        event: payload.event,
      };

      for (const listener of listeners) {
        listener(eventMessage);
      }
    }
  });

  return {
    postMessage(message) {
      const request = message as DatafnRpcRequest;
      const envelope = createRequestEnvelope({
        requestId: request.id,
        namespace: "datafn",
        method: request.method,
        source: address,
        target: { context: "background" },
        payload: request.payload,
      });

      void bridge
        .request(envelope)
        .then((responseEnvelope) => {
          const responseMessage: DatafnRpcResponse = {
            id: request.id,
            envelope: toDatafnEnvelope(responseEnvelope) as DatafnRpcResponse["envelope"],
          };

          for (const listener of listeners) {
            listener(responseMessage);
          }
        })
        .catch((error) => {
          const responseMessage: DatafnRpcResponse = {
            id: request.id,
            envelope: {
              ok: false,
              error: normalizeExtfnLikeError(error),
            } as DatafnRpcResponse["envelope"],
          };

          for (const listener of listeners) {
            listener(responseMessage);
          }
        });
    },
    onMessage(handler: (message: unknown) => void) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}

function toDatafnEnvelope(responseEnvelope: RuntimeResponseEnvelope) {
  if (responseEnvelope.ok) {
    return {
      ok: true as const,
      result: responseEnvelope.result,
    };
  }

  return {
    ok: false as const,
    error:
      responseEnvelope.error ??
      createExtfnLikeError(
        "E_RUNTIME_PROTOCOL",
        "Runtime response did not include an error payload.",
      ),
  };
}

function normalizeRuntimeResponse(
  response: unknown,
  requestId: string,
): RuntimeResponseEnvelope {
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { kind?: unknown }).kind === "response"
  ) {
    return response as RuntimeResponseEnvelope;
  }

  throw createExtfnLikeError(
    "E_RUNTIME_PROTOCOL",
    "Runtime response did not match the extfn response envelope shape.",
    { requestId },
  );
}

function isDatafnEventEnvelope(message: unknown): message is RuntimeEventEnvelope {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "event" &&
    (message as { namespace?: unknown }).namespace === "datafn" &&
    (message as { event?: unknown }).event === "subscription"
  );
}

function createBrowserProxyId(address: RuntimeAddress): string {
  return [
    address.context,
    address.surfaceId ?? "surface",
    address.contentScriptId ?? "content",
    address.tabId ?? "tab",
    address.frameId ?? "frame",
  ].join(":");
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
