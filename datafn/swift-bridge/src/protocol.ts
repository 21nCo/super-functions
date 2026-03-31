import type {
  DatafnBridgeEventEnvelope as DatafnBridgeEventPayload,
} from "@datafn/client";
import type { DatafnError, DatafnErrorCode } from "@datafn/core";

export const DATAFN_BRIDGE_PROTOCOL = "datafn-bridge/v1" as const;

export const DATAFN_BRIDGE_METHODS = [
  "handshake",
  "search.initialize",
  "search.search",
  "search.searchAll",
  "search.dispose",
  "storage.getRecord",
  "storage.listRecords",
  "storage.upsertRecord",
  "storage.deleteRecord",
  "storage.mergeRecord",
  "storage.findRecords",
  "storage.listJoinRows",
  "storage.getJoinRows",
  "storage.getJoinRowsInverse",
  "storage.upsertJoinRow",
  "storage.setJoinRows",
  "storage.deleteJoinRow",
  "storage.getCursor",
  "storage.setCursor",
  "storage.getHydrationState",
  "storage.setHydrationState",
  "storage.changelogAppend",
  "storage.changelogList",
  "storage.changelogAck",
  "storage.countRecords",
  "storage.countJoinRows",
  "storage.clearAll",
  "storage.close",
  "storage.healthCheck",
  "remote.query",
  "remote.mutation",
  "remote.transact",
  "remote.seed",
  "remote.clone",
  "remote.pull",
  "remote.push",
  "remote.reconcile",
  "sync.start",
  "sync.stop",
  "sync.pullNow",
  "sync.cloneNow",
  "sync.reconcileNow",
  "sync.schedulePush",
  "health.check",
] as const;

export type DatafnBridgeMethod =
  (typeof DATAFN_BRIDGE_METHODS)[number];

const BRIDGE_METHOD_SET = new Set<string>(DATAFN_BRIDGE_METHODS);

export const DATAFN_BRIDGE_EVENT_NAMES = [
  "bridge.ready",
  "bridge.closed",
  "storage.changed",
  "hydration.changed",
  "mutation.applied",
  "mutation.rejected",
  "sync.status",
  "sync.failed",
  "health.changed",
] as const;

export type DatafnBridgeEventName =
  (typeof DATAFN_BRIDGE_EVENT_NAMES)[number];

export interface DatafnBridgeRequestEnvelope {
  protocol: typeof DATAFN_BRIDGE_PROTOCOL;
  id: string;
  method: DatafnBridgeMethod;
  payload?: unknown;
}

export type DatafnBridgeResponseEnvelope =
  | {
      protocol: typeof DATAFN_BRIDGE_PROTOCOL;
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      protocol: typeof DATAFN_BRIDGE_PROTOCOL;
      id: string;
      ok: false;
      error: DatafnError;
    };

export interface DatafnBridgeEventEnvelope
  extends Omit<DatafnBridgeEventPayload, "protocol" | "event"> {
  protocol: typeof DATAFN_BRIDGE_PROTOCOL;
  event: DatafnBridgeEventName;
}

export interface CreateWKWebViewBridgeBusOptions {
  handlerName?: string;
  timeoutMs?: number;
}

export interface DatafnBridgeSearchResourceConfig {
  name: string;
  searchFields: string[];
}

export interface DatafnBridgeSearchInitializePayload {
  resources: DatafnBridgeSearchResourceConfig[];
}

export interface DatafnBridgeSearchPayload {
  resource: string;
  query: string;
  type?: "fullText" | "semantic";
  fields?: string[];
  limit?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
}

export interface DatafnBridgeSearchAllPayload {
  query: string;
  resources?: string[];
  fields?: string[];
  limit?: number;
  limitPerResource?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  fieldBoosts?: Record<string, number>;
}

export interface DatafnBridgeSearchResult {
  ids: string[];
}

export interface DatafnBridgeSearchAllResultItem {
  resource: string;
  id: string;
  score: number;
}

export interface DatafnBridgeBus {
  readonly __datafnNativeBacked: true;
  request(
    message: DatafnBridgeRequestEnvelope,
  ): Promise<DatafnBridgeResponseEnvelope>;
  subscribe(handler: (event: DatafnBridgeEventEnvelope) => void): () => void;
}

export type NativeBridgeMarker = {
  readonly __datafnNativeBacked: true;
};

declare global {
  interface Window {
    __datafnBridgeReceive__?: (message: unknown) => void;
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (message: unknown) => void }>;
    };
  }
}

export function createBridgeError(
  code: DatafnErrorCode,
  message: string,
  details: unknown,
): DatafnError {
  return {
    code,
    message,
    details,
  };
}

export function createBridgeErrorResponse(
  id: string,
  code: DatafnErrorCode,
  message: string,
  details: unknown,
): DatafnBridgeResponseEnvelope {
  return {
    protocol: DATAFN_BRIDGE_PROTOCOL,
    id,
    ok: false,
    error: createBridgeError(code, message, details),
  };
}

export function isBridgeEventEnvelope(
  value: unknown,
): value is DatafnBridgeEventEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === DATAFN_BRIDGE_PROTOCOL &&
    typeof (value as { event?: unknown }).event === "string"
  );
}

export function isBridgeResponseEnvelope(
  value: unknown,
): value is DatafnBridgeResponseEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === DATAFN_BRIDGE_PROTOCOL &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

export function isBridgeMethod(method: string): method is DatafnBridgeMethod {
  return BRIDGE_METHOD_SET.has(method);
}

export function nextBridgeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function unwrapBridgeResult<T>(
  response: DatafnBridgeResponseEnvelope,
): T {
  if (!response.ok) {
    throw response.error;
  }
  return response.result as T;
}

export function requestBridgeMethod<T>(
  bus: DatafnBridgeBus,
  method: DatafnBridgeMethod,
  payload?: unknown,
): Promise<T> {
  return bus
    .request({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: nextBridgeRequestId(),
      method,
      payload,
    })
    .then(unwrapBridgeResult<T>);
}
