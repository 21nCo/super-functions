import { createHash } from 'node:crypto';
import type {
  BillFnCancelSubscriptionInput,
  BillFnChangeSubscriptionInput,
  BillFnCreateCheckoutInput,
  BillFnParseWebhookInput,
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
import { verifyWebhookSignature } from '@superfunctions/webhooks';

export interface DodoProviderConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  webhookSecret?: string;
  webhookSignatureHeader?: string;
}

export function createDodoProvider(config: DodoProviderConfig): BillFnProviderAdapter {
  const fetchImpl = config.fetch ?? fetch;
  const baseUrl = (config.baseUrl ?? 'https://live.dodopayments.com').replace(/\/$/, '');
  const webhookSignatureHeader = (config.webhookSignatureHeader ?? 'x-dodo-signature').toLowerCase();

  return {
    provider: 'dodo',
    capabilities: {
      createCheckout: true,
      verifyCheckout: true,
      cancelSubscription: true,
      syncSubscription: true,
      restorePurchases: true,
      webhookIngestion: true,
      changeSubscription: true,
      resumeSubscription: true,
      refundCharge: true
    },
    async createCheckout(input: BillFnCreateCheckoutInput) {
      const isSubscription = input.price.kind === 'subscription';
      const response = await requestJson(fetchImpl, `${baseUrl}/${isSubscription ? 'subscriptions' : 'payments'}`, {
        method: 'POST',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify(
          isSubscription
            ? {
                customer: input.customer,
                billing: input.customer?.billing,
                payment_link: true,
                return_url: input.returnUrl ?? input.successUrl ?? '',
                product_id: input.price.providerProductId,
                quantity: 1
              }
            : {
                customer: input.customer,
                billing: input.customer?.billing,
                payment_link: true,
                return_url: input.returnUrl ?? input.successUrl ?? '',
                product_cart: [{ product_id: input.price.providerProductId, quantity: 1 }]
              }
        )
      });

      return {
        status: 'requires_action',
        providerCheckoutId: readString(response, ['payment_id', 'id']),
        providerSubscriptionId: readString(response, ['subscription_id']),
        providerChargeId: readString(response, ['payment_id']),
        checkoutUrl: readString(response, ['payment_link']),
        raw: response
      };
    },
    async verifyCheckout(input: BillFnVerifyCheckoutInput): Promise<BillFnVerifiedBillingState> {
      const subscriptionId =
        readString(input.payload ?? {}, ['subscriptionId', 'subscription_id']) ??
        input.checkoutSession.providerSubscriptionId;
      const chargeId =
        readString(input.payload ?? {}, ['paymentId', 'payment_id']) ??
        input.checkoutSession.providerChargeId ??
        input.checkoutSession.providerCheckoutId;

      const isSubscription = input.price.kind === 'subscription';
      const resourceId = isSubscription ? subscriptionId : chargeId;
      if (!resourceId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo verification requires a subscription or payment identifier'
        });
      }

      const response = await requestJson(
        fetchImpl,
        `${baseUrl}/${isSubscription ? 'subscriptions' : 'payments'}/${resourceId}`,
        {
          method: 'GET',
          headers: createHeaders(config.apiKey)
        }
      );

      return mapDodoState(isSubscription, response);
    },
    async fetchSubscription(input: BillFnSyncSubscriptionInput) {
      const providerSubscriptionId = input.subscription.providerSubscriptionId;
      if (!providerSubscriptionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo subscription sync requires providerSubscriptionId'
        });
      }
      const response = await requestJson(fetchImpl, `${baseUrl}/subscriptions/${providerSubscriptionId}`, {
        method: 'GET',
        headers: createHeaders(config.apiKey)
      });
      return mapDodoState(true, response);
    },
    async cancelSubscription(input: BillFnCancelSubscriptionInput) {
      const providerSubscriptionId = input.subscription.providerSubscriptionId;
      if (!providerSubscriptionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo cancellation requires providerSubscriptionId'
        });
      }
      const response = await requestJson(fetchImpl, `${baseUrl}/subscriptions/${providerSubscriptionId}`, {
        method: 'PATCH',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify({
          cancel_at_next_billing_date: true
        })
      });
      return {
        operationStatus: 'applied',
        billingState: mapDodoState(true, response),
        raw: response
      } satisfies BillFnProviderOperationResult;
    },
    async changeSubscription(input: BillFnChangeSubscriptionInput) {
      const providerSubscriptionId = input.subscription.providerSubscriptionId;
      if (!providerSubscriptionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo change subscription requires providerSubscriptionId'
        });
      }

      const attempted = await tryRequestJson(fetchImpl, `${baseUrl}/subscriptions/${providerSubscriptionId}`, {
        method: 'PATCH',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify({
          product_id: input.targetPrice.providerProductId,
          proration_behavior: normalizeDodoProration(input.prorationBehavior),
          effective_at: input.effectiveAt
        })
      });

      if (attempted.ok) {
        return {
          operationStatus: 'applied',
          billingState: mapDodoState(true, attempted.data),
          raw: attempted.data
        } satisfies BillFnProviderOperationResult;
      }

      if (!shouldFallbackToReplacementCheckout(attempted.error.status)) {
        throw createBillFnError({
          code: 'BILLFN_PROVIDER_ERROR',
          message: `Dodo change subscription failed with status ${attempted.error.status}`,
          details: attempted.error
        });
      }

      const cancellation = await requestJson(fetchImpl, `${baseUrl}/subscriptions/${providerSubscriptionId}`, {
        method: 'PATCH',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify({
          cancel_at_next_billing_date: true
        })
      });

      return {
        operationStatus: 'requires_action',
        billingState: input.effectiveAt === 'immediate' ? mapDodoState(true, cancellation) : undefined,
        clientAction: {
          type: 'redirect',
          metadata: {
            action: 'replacement-checkout',
            targetProductId: input.targetPrice.providerProductId,
            effectiveAt: input.effectiveAt
          }
        },
        raw: {
          fallback: 'replacement-checkout',
          updateError: attempted.error,
          cancellation
        }
      } satisfies BillFnProviderOperationResult;
    },
    async resumeSubscription(input: BillFnResumeSubscriptionInput) {
      const providerSubscriptionId = input.subscription.providerSubscriptionId;
      if (!providerSubscriptionId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo resume subscription requires providerSubscriptionId'
        });
      }

      const attempted = await tryRequestJson(fetchImpl, `${baseUrl}/subscriptions/${providerSubscriptionId}`, {
        method: 'PATCH',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify({
          status: 'active'
        })
      });

      if (!attempted.ok) {
        return {
          operationStatus: 'requires_action',
          clientAction: {
            type: 'redirect',
            metadata: {
              action: 'contact-support'
            }
          },
          raw: {
            resumeError: attempted.error
          }
        } satisfies BillFnProviderOperationResult;
      }

      return {
        operationStatus: 'applied',
        billingState: mapDodoState(true, attempted.data),
        raw: attempted.data
      } satisfies BillFnProviderOperationResult;
    },
    async refundCharge(input: BillFnRefundChargeInput) {
      const paymentId = input.providerChargeId ?? input.subscription?.providerChargeId;
      if (!paymentId) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo refund requires providerChargeId'
        });
      }
      const refundBody: Record<string, unknown> = {
        payment_id: paymentId,
        reason: input.reason
      };
      if (input.mode === 'custom' || input.mode === 'prorated_remaining_period') {
        if (typeof input.amount === 'number') {
          refundBody.amount = input.amount;
        }
      }

      const response = await requestJson(fetchImpl, `${baseUrl}/refunds`, {
        method: 'POST',
        headers: createHeaders(config.apiKey),
        body: JSON.stringify(refundBody)
      });

      return {
        operationStatus: 'applied',
        providerRefundId: readString(response, ['refund_id', 'id']),
        raw: response
      } satisfies BillFnProviderOperationResult;
    },
    async restorePurchases(input: BillFnRestorePurchasesInput) {
      if (input.price.kind === 'subscription') {
        const response = await requestJson(fetchImpl, `${baseUrl}/subscriptions/${input.purchaseReference}`, {
          method: 'GET',
          headers: createHeaders(config.apiKey)
        });
        return [mapDodoState(true, response)];
      }

      const response = await requestJson(fetchImpl, `${baseUrl}/payments/${input.purchaseReference}`, {
        method: 'GET',
        headers: createHeaders(config.apiKey)
      });
      return [mapDodoState(false, response)];
    },
    async parseWebhook(input: BillFnParseWebhookInput): Promise<BillFnParsedWebhookEvent[]> {
      if (!config.webhookSecret) {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo webhook parsing requires webhookSecret to be configured'
        });
      }

      const signature = input.headers.get(webhookSignatureHeader);
      if (!signature || !verifyWebhookSignature(input.rawBody, signature, config.webhookSecret)) {
        throw createBillFnError({
          code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID',
          message: 'Dodo webhook signature verification failed'
        });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(input.rawBody) as Record<string, unknown>;
      } catch {
        throw createBillFnError({
          code: 'BILLFN_VALIDATION_ERROR',
          message: 'Dodo webhook payload must be valid JSON'
        });
      }
      const type = readString(payload, ['type', 'event']) ?? 'unknown';
      const eventId = readString(payload, ['id', 'event_id']) ?? `dodo_evt_${createHash('sha256').update(input.rawBody).digest('hex')}`;
      const data = asRecord(payload.data) ?? payload;
      const isSubscription = Boolean(readString(data, ['subscription_id'])) || type.includes('subscription');

      return [
        {
          providerEventId: eventId,
          type,
          signatureVerified: true,
          occurredAt: readString(payload, ['created_at', 'timestamp']) ?? undefined,
          providerSubscriptionId: readString(data, ['subscription_id']) ?? undefined,
          providerChargeId: readString(data, ['payment_id']) ?? undefined,
          checkoutReferenceId: readString(data, ['checkout_session_id']) ?? undefined,
          billingState: mapDodoState(isSubscription, data),
          raw: payload
        }
      ];
    }
  };
}

function createHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
}

async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit) {
  const response = await fetchImpl(url, init);
  const raw = await response.text();
  if (!response.ok) {
    throw createBillFnError({
      code: 'BILLFN_PROVIDER_ERROR',
      message: `Dodo request failed with status ${response.status}`,
      details: {
        status: response.status,
        body: raw
      }
    });
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function tryRequestJson(fetchImpl: typeof fetch, url: string, init: RequestInit) {
  const response = await fetchImpl(url, init);
  const raw = await response.text();
  if (!response.ok) {
    return {
      ok: false as const,
      error: {
        status: response.status,
        body: raw
      }
    };
  }
  return {
    ok: true as const,
    data: raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  };
}

function mapDodoState(isSubscription: boolean, payload: Record<string, unknown>): BillFnVerifiedBillingState {
  const rawStatus = readString(payload, ['status']) ?? 'pending';
  const normalized = normalizeDodoStatus(rawStatus);
  return {
    subscriptionStatus: normalized,
    checkoutStatus: normalized === 'failed' ? 'failed' : normalized === 'pending' ? 'pending' : 'succeeded',
    providerSubscriptionId: readString(payload, ['subscription_id']) ?? undefined,
    providerChargeId: readString(payload, ['payment_id']) ?? undefined,
    currentPeriodStart: readString(payload, ['current_period_start', 'started_at']) ?? undefined,
    currentPeriodEnd: isSubscription ? readString(payload, ['next_billing_date', 'current_period_end']) ?? undefined : undefined,
    autoRenew: isSubscription ? normalized === 'active' || normalized === 'trialing' || normalized === 'grace' : false,
    raw: payload
  };
}

function normalizeDodoStatus(status: string): BillFnVerifiedBillingState['subscriptionStatus'] {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'on_hold':
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'canceled';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    case 'grace_period':
    case 'billing_retry':
      return 'grace';
    case 'succeeded':
      return 'active';
    default:
      return 'pending';
  }
}

function normalizeDodoProration(value: 'provider_default' | 'prorate' | 'none') {
  switch (value) {
    case 'prorate':
      return 'prorate';
    case 'none':
      return 'none';
    default:
      return 'provider_default';
  }
}

function shouldFallbackToReplacementCheckout(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
