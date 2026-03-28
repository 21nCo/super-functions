/**
 * Extension RPC types
 *
 * Canonical RPC envelopes for extension context communication.
 */

import type { DatafnEnvelope, DatafnEvent } from "@datafn/core";

export type DatafnRpcMethod =
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

export interface DatafnRpcRequest {
  id: string;
  method: DatafnRpcMethod;
  payload: unknown;
}

export interface DatafnRpcResponse {
  id: string;
  envelope: DatafnEnvelope<unknown>;
}

export interface DatafnRpcEvent {
  type: "event";
  subscriptionId: string;
  event: DatafnEvent;
}

export interface DatafnRpcSubscribePayload {
  filter?: unknown; // DatafnEventFilter
}

export interface DatafnRpcUnsubscribePayload {
  subscriptionId: string;
}
