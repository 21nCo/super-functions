import { createHash } from 'node:crypto';
import type {
  BillFnCancelSubscriptionInput,
  BillFnChangeSubscriptionInput,
  BillFnCreateCheckoutInput,
  BillFnFetchNotificationHistoryInput,
  BillFnNotificationHistoryPage,
  BillFnParsedWebhookEvent,
  BillFnProviderAdapter,
  BillFnProviderOperationResult,
  BillFnRefundChargeInput,
  BillFnRestorePurchasesInput,
  BillFnResumeSubscriptionInput,
  BillFnSyncSubscriptionInput,
  BillFnVerifiedBillingState,
  BillFnVerifyCheckoutInput
} from '@billfn/core';
import { createBillFnError } from '@billfn/core';

export interface AppleNotificationVerifierContext {
  rawBody: string;
  signedPayload: string;
}

export interface AppleAdvancedCommerceConfig {
  tokenProvider: () => Promise<string>;
  baseUrl?: string;
  enabled?: boolean;
}

export interface AppleProviderConfig {
  fetch?: typeof fetch;
  environment?: 'production' | 'sandbox';
  tokenProvider: () => Promise<string>;
  notificationVerifier?: (context: AppleNotificationVerifierContext) => Promise<Record<string, unknown> | null>;
  advancedCommerce?: AppleAdvancedCommerceConfig;
}

interface AppleTransactionExpectation {
  productId: string;
  reference: string;
  appAccountToken: string;
}

export function createAppleProvider(config: AppleProviderConfig): BillFnProviderAdapter {
  const fetchImpl = config.fetch ?? fetch;

  return {
    provider: 'apple',
    capabilities: {
      createCheckout: true,
      verifyCheckout: true,
      cancelSubscription: true,
      syncSubscription: true,
      restorePurchases: true,
      webhookIngestion: true,
      changeSubscription: true,
      resumeSubscription: true,
      refundCharge: true,
      notificationHistory: Boolean(config.notificationVerifier)
    },
    async createCheckout(input: BillFnCreateCheckoutInput) {
      const appAccountToken = createAppleAppAccountToken(input.billingAccount.id);
      return {
        status: 'requires_action',
        clientAction: {
          type: 'apple-purchase',
          productId: input.price.providerProductId,
          metadata: { appAccountToken }
        },
        raw: { appAccountToken }
      };
    },
    async verifyCheckout(input: BillFnVerifyCheckoutInput): Promise<BillFnVerifiedBillingState> {
      const transactionId = readString(input.payload ?? {}, ['transactionId', 'originalTransactionId']);
      if (!transactionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple verification requires a transactionId or originalTransactionId'
        });
      }

      if (input.price.kind === 'subscription') {
        const response = await requestStoreKitWithFallback(
          fetchImpl,
          config,
          `/inApps/v1/subscriptions/${transactionId}`
        );
        return mapAppleSubscriptionResponse(response.payload, {
          productId: input.price.providerProductId,
          reference: transactionId,
          appAccountToken: createAppleAppAccountToken(input.billingAccount.id)
        });
      }

      const response = await requestStoreKitWithFallback(fetchImpl, config, `/inApps/v2/history/${transactionId}`);
      return mapAppleHistoryResponse(response.payload, {
        productId: input.price.providerProductId,
        reference: transactionId,
        appAccountToken: createAppleAppAccountToken(input.billingAccount.id)
      });
    },
    async fetchSubscription(input: BillFnSyncSubscriptionInput) {
      const transactionId = input.subscription.providerSubscriptionId ?? input.subscription.providerChargeId;
      if (!transactionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple subscription sync requires a provider subscription reference'
        });
      }
      const response = await requestStoreKitWithFallback(fetchImpl, config, `/inApps/v1/subscriptions/${transactionId}`);
      return mapAppleSubscriptionResponse(response.payload, {
        productId: input.price.providerProductId,
        reference: transactionId,
        appAccountToken: createAppleAppAccountToken(input.subscription.billingAccountId)
      });
    },
    async cancelSubscription(input: BillFnCancelSubscriptionInput) {
      const transactionId = input.subscription.providerChargeId ?? input.subscription.providerSubscriptionId;
      if (!transactionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple cancellation requires a transaction reference'
        });
      }
      if (!config.advancedCommerce?.enabled || !config.advancedCommerce.tokenProvider) {
        return manageSubscriptionAction('Apple subscription management is handled by Apple-managed surfaces');
      }
      const response = await requestAdvancedCommerce(
        fetchImpl,
        config.advancedCommerce,
        `/subscription/cancel/${transactionId}`,
        {
          method: 'POST'
        }
      );
      return {
        operationStatus: 'applied',
        billingState: {
          subscriptionStatus: 'canceled',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: input.subscription.providerSubscriptionId,
          providerChargeId: input.subscription.providerChargeId,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: input.subscription.currentPeriodEnd,
          autoRenew: false,
          raw: response
        },
        raw: response
      } satisfies BillFnProviderOperationResult;
    },
    async changeSubscription(_input: BillFnChangeSubscriptionInput) {
      return manageSubscriptionAction('Apple plan changes are handled by Apple-managed subscription surfaces');
    },
    async resumeSubscription(_input: BillFnResumeSubscriptionInput) {
      return manageSubscriptionAction('Apple subscription resume is handled by Apple-managed subscription surfaces');
    },
    async refundCharge(input: BillFnRefundChargeInput) {
      const transactionId = input.providerChargeId ?? input.subscription?.providerChargeId ?? input.subscription?.providerSubscriptionId;
      if (!transactionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple refund requires a transaction reference'
        });
      }
      if (!config.advancedCommerce?.enabled || !config.advancedCommerce.tokenProvider) {
        return manageSubscriptionAction('Apple refunds require Advanced Commerce or Apple-managed support flows');
      }
      const response = await requestAdvancedCommerce(
        fetchImpl,
        config.advancedCommerce,
        `/subscription/revoke/${transactionId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: input.reason
          })
        }
      );
      return {
        operationStatus: 'applied',
        providerRefundId: readString(response, ['requestReferenceId', 'refundId']) ?? undefined,
        billingState: input.subscription
          ? {
              subscriptionStatus: 'canceled',
              checkoutStatus: 'succeeded',
              providerSubscriptionId: input.subscription.providerSubscriptionId,
              providerChargeId: input.subscription.providerChargeId,
              currentPeriodStart: input.subscription.currentPeriodStart,
              currentPeriodEnd: input.subscription.currentPeriodEnd,
              autoRenew: false,
              raw: response
            }
          : undefined,
        raw: response
      } satisfies BillFnProviderOperationResult;
    },
    async restorePurchases(input: BillFnRestorePurchasesInput) {
      const response = await requestStoreKitWithFallback(
        fetchImpl,
        config,
        input.price.kind === 'subscription'
          ? `/inApps/v1/subscriptions/${input.purchaseReference}`
          : `/inApps/v2/history/${input.purchaseReference}`
      );
      const expectation = {
        productId: input.price.providerProductId,
        reference: input.purchaseReference,
        appAccountToken: createAppleAppAccountToken(input.billingAccount.id)
      };
      return [input.price.kind === 'subscription'
        ? mapAppleSubscriptionResponse(response.payload, expectation)
        : mapAppleHistoryResponse(response.payload, expectation)];
    },
    async parseWebhook(input): Promise<BillFnParsedWebhookEvent[]> {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(input.rawBody) as Record<string, unknown>;
      } catch {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple webhook payload must be valid JSON'
        });
      }

      const signedPayload = readString(payload, ['signedPayload']);
      if (!signedPayload) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Apple webhook payload must include signedPayload'
        });
      }

      const decoded = await decodeNotificationPayload(config, {
        rawBody: input.rawBody,
        signedPayload
      });

      return [mapAppleNotificationEvent(decoded, signedPayload)];
    },
    async fetchNotificationHistory(input: BillFnFetchNotificationHistoryInput): Promise<BillFnNotificationHistoryPage> {
      if (!config.notificationVerifier) {
        throw createBillFnError({
          code: 'BILLFN_FEATURE_UNAVAILABLE',
          message: 'Apple notification history requires notificationVerifier'
        });
      }
      const response = await requestStoreKitWithFallback(
        fetchImpl,
        config,
        buildNotificationHistoryPath(input.cursor),
        {
          method: 'POST',
          body: JSON.stringify(buildNotificationHistoryRequest())
        }
      );
      const notifications = Array.isArray(response.payload.notificationHistory)
        ? response.payload.notificationHistory
        : Array.isArray(response.payload.signedNotifications)
          ? response.payload.signedNotifications
          : [];

      const events: BillFnParsedWebhookEvent[] = [];
      for (const entry of notifications) {
        const signedPayload = typeof entry === 'string'
          ? entry
          : typeof entry === 'object' && entry !== null && typeof (entry as { signedPayload?: unknown }).signedPayload === 'string'
            ? (entry as { signedPayload: string }).signedPayload
            : null;
        if (!signedPayload) {
          continue;
        }
        const decoded = await decodeNotificationPayload(config, {
          rawBody: JSON.stringify({ signedPayload }),
          signedPayload
        });
        events.push(mapAppleNotificationEvent(decoded, signedPayload));
      }

      return {
        events,
        nextCursor: readString(response.payload, ['paginationToken', 'nextPaginationToken']) ?? undefined
      };
    }
  };
}

async function requestStoreKitWithFallback(
  fetchImpl: typeof fetch,
  config: AppleProviderConfig,
  path: string,
  init: RequestInit = {}
) {
  const initial = config.environment ?? 'production';
  const environments: Array<'production' | 'sandbox'> = initial === 'production' ? ['production', 'sandbox'] : ['sandbox'];
  let lastError: unknown;

  for (const environment of environments) {
    try {
      const payload = await requestJson(fetchImpl, buildStoreKitBaseUrl(environment) + path, await config.tokenProvider(), init);
      return {
        environment,
        payload
      };
    } catch (error) {
      lastError = error;
      if (!shouldFallbackToSandbox(error, environment)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function requestAdvancedCommerce(
  fetchImpl: typeof fetch,
  config: AppleAdvancedCommerceConfig,
  path: string,
  init: RequestInit
) {
  const baseUrl = (config.baseUrl ?? 'https://api.storekit.itunes.apple.com/advancedCommerce/v1').replace(/\/$/, '');
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await config.tokenProvider()}`,
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    throw createBillFnError({
      code: 'BILLFN_PROVIDER_ERROR',
      message: `Apple Advanced Commerce request failed with status ${response.status}`,
      details: {
        status: response.status,
        body: raw
      }
    });
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function requestJson(fetchImpl: typeof fetch, url: string, token: string, init: RequestInit = {}) {
  const response = await fetchImpl(url, {
    ...init,
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    throw createProviderError(response.status, raw);
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function createProviderError(status: number, body: string) {
  return createBillFnError({
    code: 'BILLFN_PROVIDER_ERROR',
    message: `Apple request failed with status ${status}`,
    details: {
      status,
      body
    }
  });
}

function buildStoreKitBaseUrl(environment: 'production' | 'sandbox') {
  return environment === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';
}

function shouldFallbackToSandbox(error: unknown, environment: 'production' | 'sandbox') {
  if (environment !== 'production') {
    return false;
  }
  if (!error || typeof error !== 'object' || !('details' in error)) {
    return false;
  }
  const details = (error as { details?: { status?: unknown; body?: unknown } }).details;
  if (details?.status !== 404 || typeof details.body !== 'string') {
    return false;
  }
  try {
    const payload = JSON.parse(details.body) as { errorCode?: unknown };
    return payload.errorCode === 4040010;
  } catch {
    return false;
  }
}

async function decodeNotificationPayload(
  config: AppleProviderConfig,
  context: AppleNotificationVerifierContext
) {
  if (config.notificationVerifier) {
    const verified = await config.notificationVerifier(context);
    if (!verified) {
      throw createBillFnError({
        code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID',
        message: 'Apple notification signature verification failed'
      });
    }
    return {
      payload: verified,
      signatureVerified: true
    };
  }

  const payload = decodeJwtPayload<Record<string, unknown>>(context.signedPayload);
  if (!payload) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'Apple notification signedPayload could not be decoded'
    });
  }

  return {
    payload,
    signatureVerified: false
  };
}

function buildNotificationHistoryPath(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) {
    params.set('paginationToken', cursor);
  }
  const query = params.toString();
  return query ? `/inApps/v1/notifications/history?${query}` : '/inApps/v1/notifications/history';
}

function buildNotificationHistoryRequest() {
  const endDate = Date.now();
  return {
    startDate: endDate - 24 * 60 * 60 * 1000,
    endDate
  };
}

function mapAppleNotificationEvent(
  decoded: {
    payload: Record<string, unknown>;
    signatureVerified: boolean;
  },
  signedPayload: string
): BillFnParsedWebhookEvent {
  const notification = decoded.payload;
  const data = asRecord(notification.data) ?? {};
  const transaction = decodeSignedPayload(data, 'signedTransactionInfo');
  const renewal = decodeSignedPayload(data, 'signedRenewalInfo');
  const notificationType = readString(notification, ['notificationType']) ?? 'UNKNOWN';
  const subtype = readString(notification, ['subtype']) ?? undefined;
  const state = mapAppleNotificationState(notificationType, subtype, transaction, renewal);

  return {
    providerEventId: readString(notification, ['notificationUUID']) ?? readString(notification, ['notificationId']) ?? signedPayload,
    type: subtype ? `${notificationType}.${subtype}` : notificationType,
    signatureVerified: decoded.signatureVerified,
    occurredAt: millisToIso(readTimestamp(notification, ['signedDate'])) ?? undefined,
    providerSubscriptionId: readString(transaction ?? {}, ['originalTransactionId']) ?? undefined,
    providerChargeId: readString(transaction ?? {}, ['transactionId']) ?? undefined,
    priceId: readString(transaction ?? {}, ['productId']) ?? undefined,
    billingState: state,
    raw: notification
  };
}

function mapAppleNotificationState(
  notificationType: string,
  subtype: string | undefined,
  transaction: Record<string, unknown> | null,
  renewal: Record<string, unknown> | null
): BillFnVerifiedBillingState | undefined {
  if (notificationType === 'TEST') {
    return undefined;
  }

  const transactionState = mapTransactionPayload(transaction, renewal);
  if (!transactionState) {
    return undefined;
  }

  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
      return {
        ...transactionState,
        subscriptionStatus: 'active',
        checkoutStatus: 'succeeded'
      };
    case 'DID_FAIL_TO_RENEW':
      return {
        ...transactionState,
        subscriptionStatus: subtype === 'GRACE_PERIOD' ? 'grace' : 'past_due',
        checkoutStatus: 'succeeded'
      };
    case 'EXPIRED':
      return {
        ...transactionState,
        subscriptionStatus: 'expired',
        checkoutStatus: 'failed',
        autoRenew: false
      };
    case 'REFUND':
    case 'REFUND_DECLINED_RENEWAL':
    case 'REVOKE':
    case 'CANCEL':
      return {
        ...transactionState,
        subscriptionStatus: 'canceled',
        checkoutStatus: 'succeeded',
        autoRenew: false
      };
    case 'DID_CHANGE_RENEWAL_STATUS':
      return {
        ...transactionState,
        subscriptionStatus: 'active',
        checkoutStatus: 'succeeded',
        autoRenew: subtype === 'AUTO_RENEW_DISABLED' ? false : transactionState.autoRenew
      };
    case 'DID_CHANGE_RENEWAL_PREF':
      return {
        ...transactionState,
        subscriptionStatus: 'active',
        checkoutStatus: 'succeeded'
      };
    default:
      return transactionState;
  }
}

function mapAppleSubscriptionResponse(
  payload: Record<string, unknown>,
  expectation: AppleTransactionExpectation
): BillFnVerifiedBillingState {
  const { record: lastTransaction, transaction } = selectAppleLastTransaction(payload, expectation);
  const renewalInfo = decodeSignedPayload(lastTransaction, 'signedRenewalInfo');
  const statusCode = readNumber(lastTransaction ?? {}, ['status']) ?? readNumber(transaction, ['status']) ?? 1;
  const subscriptionStatus = normalizeAppleStatus(statusCode);
  return {
    subscriptionStatus,
    checkoutStatus: subscriptionStatus === 'failed' || subscriptionStatus === 'expired' ? 'failed' : 'succeeded',
    providerSubscriptionId: readString(transaction ?? {}, ['originalTransactionId']) ?? undefined,
    providerChargeId: readString(transaction ?? {}, ['transactionId']) ?? undefined,
    currentPeriodStart: millisToIso(readTimestamp(transaction, ['purchaseDate'])) ?? undefined,
    currentPeriodEnd: millisToIso(readTimestamp(transaction, ['expiresDate'])) ?? undefined,
    autoRenew: readNumber(renewalInfo, ['autoRenewStatus']) === 1,
    raw: payload
  };
}

function mapAppleHistoryResponse(
  payload: Record<string, unknown>,
  expectation: AppleTransactionExpectation
): BillFnVerifiedBillingState {
  const transactions = extractHistoryTransactions(payload);
  const transaction = selectAppleTransaction(transactions, expectation, 'history');
  const expiresAt = millisToIso(readTimestamp(transaction, ['expiresDate'])) ?? undefined;
  const revokedAt = millisToIso(readTimestamp(transaction, ['revocationDate'])) ?? undefined;
  const isExpired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
  const subscriptionStatus = revokedAt ? 'canceled' : isExpired ? 'expired' : 'active';
  return {
    subscriptionStatus,
    checkoutStatus: subscriptionStatus === 'expired' ? 'failed' : 'succeeded',
    providerSubscriptionId: readString(transaction, ['originalTransactionId']) ?? undefined,
    providerChargeId: readString(transaction, ['transactionId']) ?? undefined,
    currentPeriodStart: millisToIso(readTimestamp(transaction, ['purchaseDate'])) ?? undefined,
    currentPeriodEnd: expiresAt,
    autoRenew: false,
    raw: payload
  };
}

function mapTransactionPayload(
  transaction: Record<string, unknown> | null,
  renewal: Record<string, unknown> | null
): BillFnVerifiedBillingState | undefined {
  if (!transaction) {
    return undefined;
  }
  const statusCode = readNumber(transaction, ['status']) ?? 1;
  return {
    subscriptionStatus: normalizeAppleStatus(statusCode),
    checkoutStatus: statusCode === 2 ? 'failed' : 'succeeded',
    providerSubscriptionId: readString(transaction, ['originalTransactionId']) ?? undefined,
    providerChargeId: readString(transaction, ['transactionId']) ?? undefined,
    currentPeriodStart: millisToIso(readTimestamp(transaction, ['purchaseDate'])) ?? undefined,
    currentPeriodEnd: millisToIso(readTimestamp(transaction, ['expiresDate'])) ?? undefined,
    autoRenew: readNumber(renewal, ['autoRenewStatus']) === 1,
    raw: {
      transaction,
      renewal
    }
  };
}

function extractLastTransactionRecords(payload: Record<string, unknown>) {
  const groups = Array.isArray(payload.data) ? payload.data : [];
  return groups.flatMap((group) => asArrayOfRecords(asRecord(group)?.lastTransactions));
}

function selectAppleLastTransaction(
  payload: Record<string, unknown>,
  expectation: AppleTransactionExpectation
) {
  const candidates = extractLastTransactionRecords(payload)
    .map((record) => ({ record, transaction: decodeSignedPayload(record, 'signedTransactionInfo') }))
    .filter((candidate): candidate is { record: Record<string, unknown>; transaction: Record<string, unknown> } =>
      candidate.transaction !== null
    );
  if (candidates.length === 0) {
    throw createBillFnError({
      code: 'BILLFN_NOT_FOUND',
      message: 'Apple subscription response did not contain any transactions'
    });
  }
  const match = candidates.find((candidate) => appleTransactionMatches(candidate.transaction, expectation));
  if (!match) {
    throwAppleTransactionConflict();
  }
  return match;
}

function selectAppleTransaction(
  transactions: Record<string, unknown>[],
  expectation: AppleTransactionExpectation,
  responseKind: string
) {
  if (transactions.length === 0) {
    throw createBillFnError({
      code: 'BILLFN_NOT_FOUND',
      message: `Apple ${responseKind} response did not contain any transactions`
    });
  }
  const match = transactions.find((transaction) => appleTransactionMatches(transaction, expectation));
  if (!match) {
    throwAppleTransactionConflict();
  }
  return match;
}

function appleTransactionMatches(
  transaction: Record<string, unknown>,
  expectation: AppleTransactionExpectation
) {
  const transactionId = readString(transaction, ['transactionId']);
  const originalTransactionId = readString(transaction, ['originalTransactionId']);
  const productId = readString(transaction, ['productId']);
  const appAccountToken = readString(transaction, ['appAccountToken']);
  return (
    productId === expectation.productId &&
    appAccountToken?.toLowerCase() === expectation.appAccountToken.toLowerCase() &&
    (transactionId === expectation.reference || originalTransactionId === expectation.reference)
  );
}

function throwAppleTransactionConflict(): never {
  throw createBillFnError({
    code: 'BILLFN_CONFLICT',
    message: 'Apple transaction does not match the checkout product, reference, and billing account token'
  });
}

function extractHistoryTransactions(payload: Record<string, unknown>) {
  const signedTransactions = Array.isArray(payload.signedTransactions) ? payload.signedTransactions : [];
  return signedTransactions
    .map((entry) => (typeof entry === 'string' ? decodeJwtPayload<Record<string, unknown>>(entry) : null))
    .filter(Boolean) as Record<string, unknown>[];
}

function decodeSignedPayload(record: Record<string, unknown>, key: string) {
  const token = record[key];
  return typeof token === 'string' ? decodeJwtPayload<Record<string, unknown>>(token) : null;
}

function decodeJwtPayload<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const base = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base.padEnd(Math.ceil(base.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function manageSubscriptionAction(message: string): BillFnProviderOperationResult {
  return {
    operationStatus: 'requires_action',
    clientAction: {
      type: 'manage-subscription',
      metadata: {
        provider: 'apple'
      }
    },
    raw: {
      message
    }
  };
}

function normalizeAppleStatus(statusCode: number): BillFnVerifiedBillingState['subscriptionStatus'] {
  switch (statusCode) {
    case 1:
      return 'active';
    case 2:
      return 'expired';
    case 3:
    case 4:
      return 'grace';
    case 5:
      return 'canceled';
    default:
      return 'failed';
  }
}

function createAppleAppAccountToken(billingAccountId: string) {
  const bytes = createHash('sha256')
    .update(`billfn:apple:${billingAccountId}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20)
  ].join('-');
}

function millisToIso(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function readTimestamp(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    : [];
}
