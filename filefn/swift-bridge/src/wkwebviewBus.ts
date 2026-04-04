import {
  FILEFN_BRIDGE_PROTOCOL,
  createBridgeErrorResponse,
  isBridgeEventEnvelope,
  isBridgeResponseEnvelope,
  isFileFnBridgeMethod,
  type CreateWKWebViewBridgeBusOptions,
  type FileFnBridgeBus,
  type FileFnBridgeEventEnvelope,
  type FileFnBridgeResponseEnvelope,
} from "./protocol.js";

type PendingRequest = {
  resolve: (response: FileFnBridgeResponseEnvelope) => void;
  timer: ReturnType<typeof setTimeout>;
};

const activeBridgeReceivers = new Set<(message: unknown) => void>();

function installGlobalReceiver() {
  if (typeof window !== "undefined") {
    window.__filefnBridgeReceive__ = (message: unknown) => {
      activeBridgeReceivers.forEach((receiver) => receiver(message));
    };
  }
}

export function createWKWebViewBridgeBus(
  options: CreateWKWebViewBridgeBusOptions = {},
): FileFnBridgeBus {
  const handlerName = options.handlerName ?? "filefn";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pendingRequests = new Map<string, PendingRequest>();
  const eventHandlers = new Set<(event: FileFnBridgeEventEnvelope) => void>();

  const bridgeReceiver = (message: unknown) => {
    if (isBridgeResponseEnvelope(message)) {
      const pending = pendingRequests.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingRequests.delete(message.id);
      pending.resolve(message);
      if (pendingRequests.size === 0 && eventHandlers.size === 0) {
        activeBridgeReceivers.delete(bridgeReceiver);
      }
      return;
    }

    if (isBridgeEventEnvelope(message)) {
      eventHandlers.forEach((handler) => handler(message));
    }
  };

  const ensureReceiverRegistered = () => {
    installGlobalReceiver();
    activeBridgeReceivers.add(bridgeReceiver);
  };

  ensureReceiverRegistered();

  return {
    async request(message) {
      ensureReceiverRegistered();
      if (message.protocol !== FILEFN_BRIDGE_PROTOCOL) {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_PROTOCOL_MISMATCH",
          "Bridge protocol version mismatch",
          { path: "protocol" },
        );
      }

      if (!isFileFnBridgeMethod(message.method)) {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_METHOD_UNSUPPORTED",
          "Unsupported bridge method",
          { path: "method", method: message.method },
        );
      }

      if (
        message.method === "handshake" &&
        ((message.payload as { mode?: unknown } | undefined)?.mode ?? "native-backed") !==
          "native-backed"
      ) {
        return createBridgeErrorResponse(
          message.id,
          "BRIDGE_PROTOCOL_MISMATCH",
          "Native-backed mode mismatch",
          { expectedMode: "native-backed" },
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

      return new Promise<FileFnBridgeResponseEnvelope>((resolve) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(message.id);
          if (pendingRequests.size === 0 && eventHandlers.size === 0) {
            activeBridgeReceivers.delete(bridgeReceiver);
          }
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
      ensureReceiverRegistered();
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
        if (pendingRequests.size === 0 && eventHandlers.size === 0) {
          activeBridgeReceivers.delete(bridgeReceiver);
        }
      };
    },
  };
}
