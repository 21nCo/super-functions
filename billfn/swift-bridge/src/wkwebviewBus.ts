import {
  BILLFN_BRIDGE_PROTOCOL,
  createBridgeErrorResponse,
  isBridgeEventEnvelope,
  isBridgeResponseEnvelope,
  isBillFnBridgeMethod,
  type BillFnBridgeBus,
  type BillFnBridgeEventEnvelope,
  type BillFnBridgeResponseEnvelope,
  type CreateWKWebViewBridgeBusOptions
} from './protocol.js';

type PendingRequest = {
  resolve: (response: BillFnBridgeResponseEnvelope) => void;
  timer: ReturnType<typeof setTimeout>;
};

const activeBridgeReceivers = new Set<(message: unknown) => void>();

function installGlobalReceiver() {
  if (typeof window !== 'undefined') {
    window.__billfnBridgeReceive__ = (message: unknown) => {
      activeBridgeReceivers.forEach((receiver) => receiver(message));
    };
  }
}

export function createWKWebViewBridgeBus(
  options: CreateWKWebViewBridgeBusOptions = {}
): BillFnBridgeBus {
  const handlerName = options.handlerName ?? 'billfn';
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pendingRequests = new Map<string, PendingRequest>();
  const eventHandlers = new Set<(event: BillFnBridgeEventEnvelope) => void>();

  const bridgeReceiver = (message: unknown) => {
    if (isBridgeResponseEnvelope(message)) {
      const pending = pendingRequests.get(message.id);
      if (!pending) {
        return;
      }
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

  return {
    async request(message) {
      if (message.protocol !== BILLFN_BRIDGE_PROTOCOL) {
        return createBridgeErrorResponse(
          message.id,
          'BRIDGE_PROTOCOL_MISMATCH',
          'Bridge protocol version mismatch',
          { path: 'protocol' }
        );
      }

      if (!isBillFnBridgeMethod(message.method)) {
        return createBridgeErrorResponse(
          message.id,
          'BRIDGE_METHOD_UNSUPPORTED',
          'Unsupported bridge method',
          { path: 'method', method: message.method }
        );
      }

      const messageHandler =
        typeof window !== 'undefined'
          ? window.webkit?.messageHandlers?.[handlerName]
          : undefined;

      if (typeof messageHandler?.postMessage !== 'function') {
        return createBridgeErrorResponse(
          message.id,
          'BRIDGE_UNAVAILABLE',
          'Native bridge bus is not available',
          { path: `window.webkit.messageHandlers.${handlerName}` }
        );
      }

      return new Promise<BillFnBridgeResponseEnvelope>((resolve) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(message.id);
          if (pendingRequests.size === 0 && eventHandlers.size === 0) {
            activeBridgeReceivers.delete(bridgeReceiver);
          }
          resolve(
            createBridgeErrorResponse(
              message.id,
              'BRIDGE_UNAVAILABLE',
              'Native bridge did not respond before timeout',
              { path: `window.webkit.messageHandlers.${handlerName}` }
            )
          );
        }, timeoutMs);

        pendingRequests.set(message.id, { resolve, timer });
        ensureReceiverRegistered();
        messageHandler.postMessage(message);
      });
    },
    subscribe(handler) {
      eventHandlers.add(handler);
      ensureReceiverRegistered();
      return () => {
        eventHandlers.delete(handler);
        if (pendingRequests.size === 0 && eventHandlers.size === 0) {
          activeBridgeReceivers.delete(bridgeReceiver);
        }
      };
    }
  };
}
