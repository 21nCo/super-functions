export const BILLFN_BRIDGE_PROTOCOL = 'billfn-bridge/v1' as const;

export const BILLFN_BRIDGE_CAPABILITIES = [
  'billing',
  'entitlements',
  'usage',
  'checkout',
  'subscriptions',
  'purchases',
  'health',
  'events'
] as const;

export const BILLFN_BRIDGE_METHODS = [
  'handshake',
  'billing.status',
  'entitlements.get',
  'usage.get',
  'checkout.create',
  'checkout.verify',
  'purchase.restore',
  'subscription.sync',
  'subscription.cancel',
  'subscription.change',
  'subscription.resume',
  'subscription.manage',
  'health.check'
] as const;

export const BILLFN_BRIDGE_EVENT_NAMES = [
  'bridge.ready',
  'bridge.closed',
  'subscription.changed',
  'entitlements.changed',
  'health.changed'
] as const;

export type BillFnBridgeMethod = (typeof BILLFN_BRIDGE_METHODS)[number];
export type BillFnBridgeEventName = (typeof BILLFN_BRIDGE_EVENT_NAMES)[number];
export type BillFnBridgeCapability = (typeof BILLFN_BRIDGE_CAPABILITIES)[number];
export type BillFnBridgeErrorCode =
  | 'BRIDGE_PROTOCOL_MISMATCH'
  | 'BRIDGE_METHOD_UNSUPPORTED'
  | 'BRIDGE_UNAVAILABLE'
  | 'BRIDGE_HANDSHAKE_REQUIRED'
  | 'BRIDGE_INVALID_REQUEST'
  | 'BILLFN_CLIENT_ERROR'
  | 'BILLFN_CAPABILITY_UNAVAILABLE'
  | (string & {});

export interface BillFnBridgeError {
  code: BillFnBridgeErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface BillFnBridgeRequestEnvelope {
  protocol: typeof BILLFN_BRIDGE_PROTOCOL;
  id: string;
  method: BillFnBridgeMethod;
  payload?: unknown;
}

export type BillFnBridgeResponseEnvelope =
  | {
      protocol: typeof BILLFN_BRIDGE_PROTOCOL;
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      protocol: typeof BILLFN_BRIDGE_PROTOCOL;
      id: string;
      ok: false;
      error: BillFnBridgeError;
    };

export interface BillFnBridgeEventEnvelope {
  protocol: typeof BILLFN_BRIDGE_PROTOCOL;
  event: BillFnBridgeEventName;
  payload: unknown;
}

export interface CreateWKWebViewBridgeBusOptions {
  handlerName?: string;
  timeoutMs?: number;
}

export interface BillFnBridgeHandshakePayload {
  clientId: string;
  mode: 'native-backed' | 'web-owned';
  baseURL: string;
}

export interface BillFnBridgeHandshakeResult {
  bridgeVersion: number;
  billingOwner: 'native';
  authOwner: 'native' | 'web';
  capabilities: string[];
}

export interface CreateNativeBackedBillFnClientOptions
  extends CreateWKWebViewBridgeBusOptions,
    BillFnBridgeHandshakePayload {}

export interface BillFnBridgeBus {
  request(message: BillFnBridgeRequestEnvelope): Promise<BillFnBridgeResponseEnvelope>;
  subscribe(handler: (event: BillFnBridgeEventEnvelope) => void): () => void;
}

export interface NativeBackedBillFnClient {
  handshake(): Promise<BillFnBridgeHandshakeResult>;
  request(method: Exclude<BillFnBridgeMethod, 'handshake'>, payload?: unknown): Promise<unknown>;
  getBillingStatus(payload?: unknown): Promise<unknown>;
  getEntitlements(payload?: unknown): Promise<unknown>;
  getUsage(payload?: unknown): Promise<unknown>;
  createCheckout(payload: unknown): Promise<unknown>;
  verifyCheckout(payload: unknown): Promise<unknown>;
  restorePurchase(payload: unknown): Promise<unknown>;
  syncSubscription(payload?: unknown): Promise<unknown>;
  cancelSubscription(payload?: unknown): Promise<unknown>;
  changeSubscription(payload: unknown): Promise<unknown>;
  resumeSubscription(payload?: unknown): Promise<unknown>;
  manageSubscription(payload?: unknown): Promise<unknown>;
  healthCheck(payload?: unknown): Promise<unknown>;
  subscribe(handler: (event: BillFnBridgeEventEnvelope) => void): () => void;
}

declare global {
  interface Window {
    __billfnBridgeReceive__?: (message: unknown) => void;
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (message: unknown) => void }>;
    };
  }
}

const BRIDGE_METHOD_SET = new Set<string>(BILLFN_BRIDGE_METHODS);
const BRIDGE_EVENT_SET = new Set<string>(BILLFN_BRIDGE_EVENT_NAMES);

export function isBillFnBridgeMethod(method: string): method is BillFnBridgeMethod {
  return BRIDGE_METHOD_SET.has(method);
}

export function isBridgeEventEnvelope(value: unknown): value is BillFnBridgeEventEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === BILLFN_BRIDGE_PROTOCOL &&
    typeof (value as { event?: unknown }).event === 'string' &&
    BRIDGE_EVENT_SET.has((value as { event: string }).event)
  );
}

export function isBridgeResponseEnvelope(value: unknown): value is BillFnBridgeResponseEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { protocol?: unknown }).protocol === BILLFN_BRIDGE_PROTOCOL &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

export function isBridgeHandshakeResult(value: unknown): value is BillFnBridgeHandshakeResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { bridgeVersion?: unknown }).bridgeVersion === 'number' &&
    typeof (value as { billingOwner?: unknown }).billingOwner === 'string' &&
    Array.isArray((value as { capabilities?: unknown }).capabilities)
  );
}

export function nextBridgeRequestId() {
  return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBridgeErrorResponse(
  id: string,
  code: BillFnBridgeErrorCode,
  message: string,
  details?: Record<string, unknown>
): BillFnBridgeResponseEnvelope {
  return {
    protocol: BILLFN_BRIDGE_PROTOCOL,
    id,
    ok: false,
    error: {
      code,
      message,
      details
    }
  };
}
