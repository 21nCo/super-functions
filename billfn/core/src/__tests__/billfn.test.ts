import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { MemoryQueueAdapter } from '../../../../packages/queue/src/index.js';
import { createBillFn, createBillFnReconciliationWorker } from '../index.js';
import type { BillFnCatalog, BillFnProviderAdapter } from '../types.js';

const catalog: BillFnCatalog = {
  plans: [
    {
      productKey: 'nucleus',
      planKey: 'pro',
      displayName: 'Pro',
      features: {
        sync: true,
        analytics: true
      },
      limits: {
        storage: 1000
      },
      prices: [
        {
          priceId: 'price_pro_dodo_month',
          provider: 'dodo',
          providerProductId: 'pdt_pro_month',
          currency: 'USD',
          amount: 12,
          kind: 'subscription',
          interval: 'month'
        },
        {
          priceId: 'price_pro_dodo_year',
          provider: 'dodo',
          providerProductId: 'pdt_pro_year',
          currency: 'USD',
          amount: 100,
          kind: 'subscription',
          interval: 'year'
        },
        {
          priceId: 'price_pro_apple_month',
          provider: 'apple',
          providerProductId: 'apple.pro.month',
          currency: 'USD',
          amount: 12,
          kind: 'subscription',
          interval: 'month'
        }
      ]
    }
  ]
};

function createMockProvider(provider: 'dodo' | 'apple'): BillFnProviderAdapter {
  return {
    provider,
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
      notificationHistory: true
    },
    async createCheckout(input) {
      if (provider === 'apple') {
        return {
          status: 'requires_action',
          clientAction: {
            type: 'apple-purchase',
            productId: input.price.providerProductId
          }
        };
      }
      return {
        status: 'requires_action',
        checkoutUrl: 'https://billing.example.test/checkout',
        providerCheckoutId: `checkout_${input.checkoutSessionId}`
      };
    },
    async verifyCheckout(input) {
      return {
        subscriptionStatus: 'active',
        checkoutStatus: 'succeeded',
        providerSubscriptionId: input.checkoutSession.providerSubscriptionId ?? `sub_${input.checkoutSession.checkoutSessionId}`,
        providerChargeId: 'charge_123',
        currentPeriodStart: '2026-04-20T00:00:00.000Z',
        currentPeriodEnd: '2026-05-20T00:00:00.000Z',
        autoRenew: true,
        raw: {
          provider
        }
      };
    },
    async fetchSubscription(input) {
      return {
        subscriptionStatus: input.subscription.status,
        checkoutStatus: 'succeeded',
        providerSubscriptionId: input.subscription.providerSubscriptionId,
        providerChargeId: input.subscription.providerChargeId,
        currentPeriodStart: input.subscription.currentPeriodStart,
        currentPeriodEnd: input.subscription.currentPeriodEnd,
        autoRenew: input.subscription.autoRenew
      };
    },
    async cancelSubscription(input) {
      return {
        operationStatus: 'applied',
        billingState: {
          subscriptionStatus: 'canceled',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: input.subscription.providerSubscriptionId,
          providerChargeId: input.subscription.providerChargeId,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: input.subscription.currentPeriodEnd,
          autoRenew: false
        }
      };
    },
    async changeSubscription(input) {
      return {
        operationStatus: 'applied',
        billingState: {
          subscriptionStatus: 'active',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: input.subscription.providerSubscriptionId,
          providerChargeId: input.subscription.providerChargeId,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: '2027-04-20T00:00:00.000Z',
          autoRenew: true,
          raw: {
            targetPriceId: input.targetPrice.priceId
          }
        }
      };
    },
    async resumeSubscription(input) {
      return {
        operationStatus: 'applied',
        billingState: {
          subscriptionStatus: 'active',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: input.subscription.providerSubscriptionId,
          providerChargeId: input.subscription.providerChargeId,
          currentPeriodStart: input.subscription.currentPeriodStart,
          currentPeriodEnd: input.subscription.currentPeriodEnd,
          autoRenew: true
        }
      };
    },
    async refundCharge(input) {
      return {
        operationStatus: 'applied',
        providerRefundId: `refund_${input.providerChargeId ?? 'none'}`
      };
    },
    async restorePurchases(input) {
      return [
        {
          subscriptionStatus: 'active',
          checkoutStatus: 'succeeded',
          providerSubscriptionId: `restored_${input.purchaseReference}`,
          providerChargeId: `charge_${input.purchaseReference}`,
          currentPeriodStart: '2026-04-20T00:00:00.000Z',
          currentPeriodEnd: '2026-05-20T00:00:00.000Z',
          autoRenew: true
        }
      ];
    },
    async parseWebhook() {
      return [
        {
          providerEventId: 'evt_123',
          type: 'subscription.updated',
          signatureVerified: true,
          billingState: {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId: 'sub_manual',
            providerChargeId: 'charge_manual',
            currentPeriodStart: '2026-04-20T00:00:00.000Z',
            currentPeriodEnd: '2026-05-20T00:00:00.000Z',
            autoRenew: true
          },
          raw: {
            ok: true
          }
        }
      ];
    },
    async fetchNotificationHistory() {
      return {
        events: [],
        nextCursor: 'cursor_next'
      };
    }
  };
}

describe('@billfn/core', () => {
  it('creates, verifies, and reads entitlements for a Dodo checkout', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_123' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error('expected success');
    }
    expect(created.data.checkoutSession.checkoutUrl).toBe('https://billing.example.test/checkout');

    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_123' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      throw new Error('expected success');
    }
    expect(verified.data.subscription.status).toBe('active');
    expect(verified.data.entitlements.status).toBe('active');

    const entitlements = await billfn.getEntitlements({ principalId: 'user_123' });
    expect(entitlements.ok).toBe(true);
    if (!entitlements.ok) {
      throw new Error('expected success');
    }
    expect(entitlements.data.entitlements?.features.sync).toBe(true);
    expect(entitlements.data.entitlements?.limits.storage).toBe(1000);
  });

  it('supports Apple purchase verification without a server-side redirect checkout', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        apple: createMockProvider('apple')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_apple' },
      planKey: 'pro',
      provider: 'apple',
      interval: 'month'
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error('expected success');
    }
    expect(created.data.checkoutSession.clientAction?.type).toBe('apple-purchase');

    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_apple' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId,
      payload: {
        transactionId: '200000001'
      }
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      throw new Error('expected success');
    }
    expect(verified.data.subscription.provider).toBe('apple');
  });

  it('supports subscription change, resume, and refund lifecycle operations', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_lifecycle' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }

    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_lifecycle' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }

    const changed = await billfn.changeSubscription({
      subject: { principalId: 'user_lifecycle' },
      targetPriceId: 'price_pro_dodo_year'
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error('expected success');
    }
    expect(changed.data.operationStatus).toBe('applied');
    expect(changed.data.subscription.priceId).toBe('price_pro_dodo_year');

    const canceled = await billfn.cancelSubscription({
      subject: { principalId: 'user_lifecycle' }
    });
    expect(canceled.ok).toBe(true);
    if (!canceled.ok) {
      throw new Error('expected success');
    }
    expect(canceled.data.subscription.status).toBe('canceled');

    const resumed = await billfn.resumeSubscription({
      subject: { principalId: 'user_lifecycle' },
      subscriptionId: canceled.data.subscription.id
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) {
      throw new Error('expected success');
    }
    expect(resumed.data.subscription.status).toBe('active');

    const refunded = await billfn.refundCharge({
      subject: { principalId: 'user_lifecycle' },
      mode: 'full'
    });
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) {
      throw new Error('expected success');
    }
    expect(refunded.data.refund.providerRefundId).toContain('refund_');
  });

  it('enforces quota limits through the filefn-compatible quota provider', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_quota' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }

    await billfn.verifyCheckout({
      subject: { principalId: 'user_quota' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    await billfn.quotaProvider.recordUsage({
      principalId: 'user_quota',
      bytes: 900
    });

    const allowed = await billfn.quotaProvider.checkQuota({
      principalId: 'user_quota',
      requestedBytes: 50
    });
    expect(allowed.allowed).toBe(true);

    const denied = await billfn.quotaProvider.checkQuota({
      principalId: 'user_quota',
      requestedBytes: 200
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('quota_exceeded');
  });

  it('prefers the auth-resolved subject over caller-supplied subject input', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      },
      auth: {
        resolveSubject: async () => ({ principalId: 'user_auth' })
      }
    });

    const response = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/checkouts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          subject: { principalId: 'user_body' },
          planKey: 'pro',
          provider: 'dodo',
          interval: 'month'
        })
      })
    );

    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        billingAccount: {
          id: string;
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.billingAccount.id).toBe('ba_user_user_auth');
  });

  it('rejects restoring a purchase that is linked to a different billing account', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'owner_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });

    if (!created.ok) {
      throw new Error('expected success');
    }

    await expect(
      billfn.restorePurchases({
        subject: { principalId: 'other_user' },
        planKey: 'pro',
        provider: 'dodo',
        purchaseReference: created.data.checkoutSession.checkoutSessionId
      })
    ).rejects.toMatchObject({
      code: 'BILLFN_CONFLICT'
    });
  });

  it('bootstraps subscription state from a checkout-linked webhook and dedupes repeat deliveries', async () => {
    let checkoutReferenceId = '';

    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [
          {
            providerEventId: 'evt_bootstrap',
            type: 'subscription.updated',
            signatureVerified: true,
            checkoutReferenceId,
            providerSubscriptionId: 'sub_bootstrap',
            providerChargeId: 'charge_bootstrap',
            billingState: {
              subscriptionStatus: 'active',
              checkoutStatus: 'succeeded',
              providerSubscriptionId: 'sub_bootstrap',
              providerChargeId: 'charge_bootstrap',
              currentPeriodStart: '2026-04-20T00:00:00.000Z',
              currentPeriodEnd: '2026-05-20T00:00:00.000Z',
              autoRenew: true
            },
            raw: {
              ok: true
            }
          }
        ];
      }
    };

    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: { dodo: provider }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'webhook_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });

    if (!created.ok) {
      throw new Error('expected success');
    }

    checkoutReferenceId = created.data.checkoutSession.checkoutSessionId;

    const first = await billfn.handleWebhook({
      provider: 'dodo',
      rawBody: '{}',
      headers: new Headers()
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error('expected success');
    }
    expect(first.data.processed).toBe(1);

    const entitlements = await billfn.getEntitlements({ principalId: 'webhook_user' });
    expect(entitlements.ok).toBe(true);
    if (!entitlements.ok) {
      throw new Error('expected success');
    }
    expect(entitlements.data.subscription?.providerSubscriptionId).toBe('sub_bootstrap');
    expect(entitlements.data.entitlements?.status).toBe('active');

    const second = await billfn.handleWebhook({
      provider: 'dodo',
      rawBody: '{}',
      headers: new Headers()
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error('expected success');
    }
    expect(second.data.processed).toBe(0);
  });

  it('supports reconciliation jobs through service methods, router ops auth, and the worker queue', async () => {
    const db = memoryAdapter({ debug: false });
    const queue = new MemoryQueueAdapter();
    const billfn = createBillFn({
      db,
      catalog,
      queue,
      providers: {
        dodo: createMockProvider('dodo')
      },
      operations: {
        authorize: async (request) => request.headers.get('x-ops-key') === 'secret'
      }
    });

    const unauthorized = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/ops/reconciliation/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'notification-history-backfill',
          provider: 'dodo'
        })
      })
    );
    expect(unauthorized.status).toBe(403);

    const enqueuedResponse = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/ops/reconciliation/jobs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ops-key': 'secret'
        },
        body: JSON.stringify({
          kind: 'notification-history-backfill',
          provider: 'dodo'
        })
      })
    );
    const enqueuedPayload = (await enqueuedResponse.json()) as {
      ok: boolean;
      data: {
        job: {
          id: string;
          status: string;
        };
      };
    };
    expect(enqueuedPayload.ok).toBe(true);
    expect(enqueuedPayload.data.job.status).toBe('pending');

    const worker = createBillFnReconciliationWorker({
      db,
      catalog,
      queue,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });
    const jobBefore = await billfn.getReconciliationJob({
      jobId: enqueuedPayload.data.job.id
    });
    expect(jobBefore.ok).toBe(true);
    if (!jobBefore.ok) {
      throw new Error('expected success');
    }
    expect(jobBefore.data.job.status).toBe('pending');

    const ran = await worker.runNext();
    expect(ran?.status).toBe('succeeded');

    const jobAfter = await billfn.getReconciliationJob({
      jobId: enqueuedPayload.data.job.id
    });
    expect(jobAfter.ok).toBe(true);
    if (!jobAfter.ok) {
      throw new Error('expected success');
    }
    expect(jobAfter.data.job.status).toBe('succeeded');
  });

  it('retries concurrent usage updates and rejects negative usage deltas', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'usage_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });

    if (!created.ok) {
      throw new Error('expected success');
    }

    await billfn.verifyCheckout({
      subject: { principalId: 'usage_user' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    await Promise.all(
      Array.from({ length: 25 }, () =>
        billfn.quotaProvider.recordUsage({
          principalId: 'usage_user',
          bytes: 1
        })
      )
    );

    const usage = await billfn.quotaProvider.getUsage('usage_user');
    expect(usage.current).toBe(25);

    await expect(
      billfn.quotaProvider.recordUsage({
        principalId: 'usage_user',
        bytes: -1
      })
    ).rejects.toMatchObject({
      code: 'BILLFN_VALIDATION_ERROR'
    });
  });
});
