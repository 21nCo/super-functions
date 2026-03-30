import {
  DATAFN_BRIDGE_PROTOCOL,
  createBridgeErrorResponse,
  isBridgeEventEnvelope,
  isBridgeMethod,
  isBridgeResponseEnvelope,
  type CreateWKWebViewBridgeBusOptions,
  type DatafnBridgeBus,
  type DatafnBridgeEventEnvelope,
  type DatafnBridgeResponseEnvelope,
} from "./protocol.js";

type PendingRequest = {
  resolve: (response: DatafnBridgeResponseEnvelope) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();
const eventHandlers = new Set<(event: DatafnBridgeEventEnvelope) => void>();

const bridgeReceiver = (message: unknown) => {
  if (isBridgeResponseEnvelope(message)) {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(message.id);
    pending.resolve(message);
    return;
  }

  if (isBridgeEventEnvelope(message)) {
    eventHandlers.forEach((handler) => handler(message));
  }
};

function installGlobalReceiver() {
  if (typeof window !== "undefined") {
    window.__datafnBridgeReceive__ = bridgeReceiver;
  }
}

export function createWKWebViewBridgeBus(
  options: CreateWKWebViewBridgeBusOptions = {},
): DatafnBridgeBus {
  const handlerName = options.handlerName ?? "datafn";
  const timeoutMs = options.timeoutMs ?? 30_000;

  installGlobalReceiver();

  return {
    __datafnNativeBacked: true,
    async request(message) {
      if (message.protocol !== DATAFN_BRIDGE_PROTOCOL) {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_PROTOCOL_MISMATCH",
          "Bridge protocol version mismatch",
          { path: "protocol" },
        );
      }

      if (!isBridgeMethod(message.method)) {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_METHOD_UNSUPPORTED",
          "Unsupported bridge method",
          { path: "method", method: message.method },
        );
      }

      const postMessage =
        typeof window !== "undefined"
          ? window.webkit?.messageHandlers?.[handlerName]?.postMessage
          : undefined;

      if (typeof postMessage !== "function") {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_UNAVAILABLE",
          "Native bridge bus is not available",
          { path: `window.webkit.messageHandlers.${handlerName}` },
        );
      }

      return new Promise<DatafnBridgeResponseEnvelope>((resolve) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(message.id);
          resolve(
            createBridgeErrorResponse(
              message.id,
              "BRIDGE_UNAVAILABLE",
              "Native bridge did not respond before timeout",
              { path: `window.webkit.messageHandlers.${handlerName}` },
            ),
          );
        }, timeoutMs);

        pendingRequests.set(message.id, { resolve, timer });
        postMessage(message);
      });
    },
    subscribe(handler) {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };
}
