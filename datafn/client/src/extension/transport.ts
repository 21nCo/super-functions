/**
 * Extension Transport Adapter
 *
 * Forwards DFQL calls to a background runtime via message bus.
 */

import type { DatafnRemoteAdapter } from "../client.js";
import type {
  DatafnRpcRequest,
  DatafnRpcResponse,
  DatafnRpcMethod,
} from "./rpc.js";
import { createClientError } from "../errors.js";

/**
 * Interface for the message bus (compatible with browser.runtime.sendMessage or similar)
 */
export interface MessageBus {
  postMessage(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
}

// Define extended adapter interface
export interface ExtensionRemoteAdapter extends DatafnRemoteAdapter {
  subscribeRemote(filter?: unknown): Promise<string>;
  unsubscribeRemote(subscriptionId: string): Promise<void>;
  onEvent(handler: (event: unknown) => void): () => void;
}

/**
 * Creates a remote adapter that proxies calls over a message bus using canonical RPC envelopes.
 */
export function createExtensionTransport(
  bus: MessageBus,
): ExtensionRemoteAdapter {
  // Promise map for pending requests: id -> { resolve, reject }
  const pending = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: unknown) => void }
  >();

  // Event handlers
  const eventHandlers = new Set<(event: unknown) => void>();

  // Helper to generate unique IDs
  let idCounter = 0;
  const generateId = () => {
    idCounter += 1;
    return `req-${idCounter}`;
  };

  // Send RPC request and wait for envelope response
  const request = async (
    method: DatafnRpcMethod,
    payload: unknown,
  ): Promise<unknown> => {
    const id = generateId();
    const rpcRequest: DatafnRpcRequest = { id, method, payload };

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      bus.postMessage(rpcRequest);
    });
  };

  // Listen for messages
  bus.onMessage((msg: unknown) => {
    // 1. Check for RPC Response
    const response = msg as DatafnRpcResponse;
    if (
      response &&
      response.id &&
      pending.has(response.id) &&
      response.envelope
    ) {
      const { resolve } = pending.get(response.id)!;
      resolve(response.envelope);
      pending.delete(response.id);
      return;
    }

    // 2. Check for Inbound Event (Fanout)
    const evt = msg as any; // Cast to check internal structure
    if (evt && evt.type === "event" && evt.event) {
      const delivery = {
        subscriptionId: evt.subscriptionId,
        event: evt.event,
      };
      eventHandlers.forEach((handler) => handler(delivery));
    }
  });

  return {
    async query(q: unknown) {
      return request("query", q);
    },
    async mutation(m: unknown) {
      return request("mutation", m);
    },
    async transact(t: unknown) {
      return request("transact", t);
    },
    async seed(payload: unknown) {
      return request("seed", payload);
    },
    async clone(payload: unknown) {
      return request("clone", payload);
    },
    async pull(payload: unknown) {
      return request("pull", payload);
    },
    async push(payload: unknown) {
      return request("push", payload);
    },
    // New Extension methods
    async subscribeRemote(filter?: unknown) {
      // We expect the result to be { ok: true, result: { subscriptionId: "..." } }
      // The `request` wrapper returns the envelope.
      // We need to unwrap strictly here or assume caller handles it?
      // Wait, `request` returns the ENVELOPE. `unwrapRemoteSuccess` is usually used upstream.
      // But `ExtensionRemoteAdapter` returns Promise<string>.
      // So we must unwrap here or return envelope.
      // DatafnRemoteAdapter returns `Promise<unknown>` which is usually envelope.
      // But our new methods return specific types.

      const env = (await request("subscribe", { filter })) as any;
      if (!env.ok) throw env.error;
      return env.result.subscriptionId;
    },
    async unsubscribeRemote(subscriptionId: string) {
      const env = (await request("unsubscribe", { subscriptionId })) as any;
      if (!env.ok) throw env.error;
    },
    onEvent(handler: (event: unknown) => void) {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };
}
