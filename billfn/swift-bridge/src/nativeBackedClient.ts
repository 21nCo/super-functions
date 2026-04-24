import {
  BILLFN_BRIDGE_PROTOCOL,
  isBridgeHandshakeResult,
  nextBridgeRequestId,
  type BillFnBridgeBus,
  type BillFnBridgeError,
  type BillFnBridgeEventEnvelope,
  type BillFnBridgeHandshakeResult,
  type BillFnBridgeMethod,
  type BillFnBridgeRequestEnvelope,
  type BillFnBridgeResponseEnvelope,
  type CreateNativeBackedBillFnClientOptions,
  type NativeBackedBillFnClient
} from './protocol.js';
import { createWKWebViewBridgeBus } from './wkwebviewBus.js';

export class BillFnBridgeClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: BillFnBridgeError['code'], message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BillFnBridgeClientError';
    this.code = code;
    this.details = details;
  }
}

function assertBridgeSuccess(
  response: BillFnBridgeResponseEnvelope
): asserts response is Extract<BillFnBridgeResponseEnvelope, { ok: true }> {
  if (!response.ok) {
    throw new BillFnBridgeClientError(response.error.code, response.error.message, response.error.details);
  }
}

function buildRequest(
  method: BillFnBridgeRequestEnvelope['method'],
  payload?: unknown
): BillFnBridgeRequestEnvelope {
  return {
    protocol: BILLFN_BRIDGE_PROTOCOL,
    id: nextBridgeRequestId(),
    method,
    payload
  };
}

export function createNativeBackedBillFnClient(
  options: CreateNativeBackedBillFnClientOptions,
  bus: BillFnBridgeBus = createWKWebViewBridgeBus(options)
): NativeBackedBillFnClient {
  let handshakeResult: BillFnBridgeHandshakeResult | null = null;

  const request = async (
    method: Exclude<BillFnBridgeMethod, 'handshake'>,
    payload?: unknown
  ): Promise<unknown> => {
    if (handshakeResult == null) {
      throw new BillFnBridgeClientError(
        'BRIDGE_HANDSHAKE_REQUIRED',
        'handshake must complete before native-backed requests'
      );
    }

    const response = await bus.request(buildRequest(method, payload));
    assertBridgeSuccess(response);
    return response.result;
  };

  return {
    async handshake() {
      const response = await bus.request(
        buildRequest('handshake', {
          clientId: options.clientId,
          mode: options.mode,
          baseURL: options.baseURL
        })
      );

      assertBridgeSuccess(response);
      if (!isBridgeHandshakeResult(response.result)) {
        throw new BillFnBridgeClientError(
          'BRIDGE_PROTOCOL_MISMATCH',
          'Native bridge returned an invalid handshake payload'
        );
      }

      handshakeResult = response.result;
      return handshakeResult;
    },
    request,
    getBillingStatus(payload) {
      return request('billing.status', payload);
    },
    getEntitlements(payload) {
      return request('entitlements.get', payload);
    },
    getUsage(payload) {
      return request('usage.get', payload);
    },
    createCheckout(payload) {
      return request('checkout.create', payload);
    },
    verifyCheckout(payload) {
      return request('checkout.verify', payload);
    },
    restorePurchase(payload) {
      return request('purchase.restore', payload);
    },
    syncSubscription(payload) {
      return request('subscription.sync', payload);
    },
    cancelSubscription(payload) {
      return request('subscription.cancel', payload);
    },
    changeSubscription(payload) {
      return request('subscription.change', payload);
    },
    resumeSubscription(payload) {
      return request('subscription.resume', payload);
    },
    manageSubscription(payload) {
      return request('subscription.manage', payload);
    },
    healthCheck(payload) {
      return request('health.check', payload);
    },
    subscribe(handler: (event: BillFnBridgeEventEnvelope) => void) {
      return bus.subscribe(handler);
    }
  };
}
