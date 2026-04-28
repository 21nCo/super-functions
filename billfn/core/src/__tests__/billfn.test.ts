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

  it('does not fall back to caller-supplied subjects when auth resolution returns null', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      },
      auth: {
        resolveSubject: async () => null
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
      error: {
        code: string;
      };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('BILLFN_VALIDATION_ERROR');
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

  it('continues restore candidate scanning after a mismatched billing account', async () => {
    const db = memoryAdapter({ debug: false });
    let mismatchedProviderSubscriptionId = '';
    let matchingProviderSubscriptionId = '';
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async restorePurchases() {
        return [
          {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId: mismatchedProviderSubscriptionId,
            currentPeriodStart: '2026-04-20T00:00:00.000Z',
            currentPeriodEnd: '2026-05-20T00:00:00.000Z',
            autoRenew: true
          },
          {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId: matchingProviderSubscriptionId,
            currentPeriodStart: '2026-04-20T00:00:00.000Z',
            currentPeriodEnd: '2026-05-20T00:00:00.000Z',
            autoRenew: true
          }
        ];
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: {
        dodo: provider
      }
    });

    const mismatched = await billfn.createCheckout({
      subject: { principalId: 'restore_other' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    const matching = await billfn.createCheckout({
      subject: { principalId: 'restore_owner' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!mismatched.ok || !matching.ok) {
      throw new Error('expected success');
    }

    const mismatchedVerified = await billfn.verifyCheckout({
      subject: { principalId: 'restore_other' },
      checkoutSessionId: mismatched.data.checkoutSession.checkoutSessionId
    });
    const matchingVerified = await billfn.verifyCheckout({
      subject: { principalId: 'restore_owner' },
      checkoutSessionId: matching.data.checkoutSession.checkoutSessionId
    });
    if (!mismatchedVerified.ok || !matchingVerified.ok) {
      throw new Error('expected success');
    }
    mismatchedProviderSubscriptionId = mismatchedVerified.data.subscription.providerSubscriptionId ?? '';
    matchingProviderSubscriptionId = matchingVerified.data.subscription.providerSubscriptionId ?? '';

    const restored = await billfn.restorePurchases({
      subject: { principalId: 'restore_owner' },
      planKey: 'pro',
      provider: 'dodo',
      purchaseReference: 'restore_batch'
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      throw new Error('expected success');
    }
    expect(restored.data.subscription.providerSubscriptionId).toBe(matchingProviderSubscriptionId);
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

  it('skips already processed notification-history receipts during replay', async () => {
    const db = memoryAdapter({ debug: false });
    let providerSubscriptionId = '';
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async fetchNotificationHistory() {
        return {
          events: [
            {
              providerEventId: 'evt_history_processed',
              type: 'subscription.updated',
              signatureVerified: true,
              billingState: {
                subscriptionStatus: 'active',
                checkoutStatus: 'succeeded',
                providerSubscriptionId,
                providerChargeId: 'charge_123',
                currentPeriodStart: '2026-04-20T00:00:00.000Z',
                currentPeriodEnd: '2026-05-20T00:00:00.000Z',
                autoRenew: true
              },
              raw: {
                ok: true
              }
            }
          ],
          nextCursor: 'cursor_next'
        };
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: {
        dodo: provider
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_history' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_history' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    providerSubscriptionId = verified.data.subscription.providerSubscriptionId ?? '';

    const first = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!first.ok) {
      throw new Error('expected success');
    }
    await billfn.runReconciliationJob({ jobId: first.data.job.id });
    const eventsAfterFirst = await db.findMany({
      model: 'billingEvents',
      where: [],
      namespace: 'billfn'
    });
    const subscriptionEventsAfterFirst = eventsAfterFirst.filter(
      (event) => event.billingAccountId === 'ba_user_user_history'
    );

    const second = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!second.ok) {
      throw new Error('expected success');
    }
    await billfn.runReconciliationJob({ jobId: second.data.job.id });
    const eventsAfterSecond = await db.findMany({
      model: 'billingEvents',
      where: [],
      namespace: 'billfn'
    });
    const subscriptionEventsAfterSecond = eventsAfterSecond.filter(
      (event) => event.billingAccountId === 'ba_user_user_history'
    );

    expect(subscriptionEventsAfterSecond).toHaveLength(subscriptionEventsAfterFirst.length);
  });

  it('rejects unverified notification-history events before projection', async () => {
    const db = memoryAdapter({ debug: false });
    let providerSubscriptionId = '';
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async fetchNotificationHistory() {
        return {
          events: [
            {
              providerEventId: 'evt_history_unverified',
              type: 'subscription.updated',
              signatureVerified: false,
              billingState: {
                subscriptionStatus: 'canceled',
                checkoutStatus: 'succeeded',
                providerSubscriptionId,
                providerChargeId: 'charge_123',
                currentPeriodStart: '2026-04-20T00:00:00.000Z',
                currentPeriodEnd: '2026-05-20T00:00:00.000Z',
                autoRenew: false
              },
              raw: {
                ok: true
              }
            }
          ],
          nextCursor: 'cursor_next'
        };
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: {
        dodo: provider
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_unverified_history' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_unverified_history' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    providerSubscriptionId = verified.data.subscription.providerSubscriptionId ?? '';

    const job = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!job.ok) {
      throw new Error('expected success');
    }

    await expect(billfn.runReconciliationJob({ jobId: job.data.job.id })).rejects.toMatchObject({
      code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID'
    });
  });

  it('recovers from duplicate entitlement and reconciliation cursor creates', async () => {
    const db = memoryAdapter({ debug: false });
    const duplicatedModels = new Set<string>();
    const racingDb = {
      ...db,
      async create<T>(params: Parameters<typeof db.create>[0]): Promise<T> {
        if ((params.model === 'entitlementSnapshots' || params.model === 'reconciliationCursors') && !duplicatedModels.has(params.model)) {
          duplicatedModels.add(params.model);
          await db.create(params);
          throw new Error(`UNIQUE constraint failed: record with id "${String(params.data.id)}" already exists in ${params.model}`);
        }
        return db.create<T>(params);
      }
    };
    const billfn = createBillFn({
      db: racingDb,
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_race' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'user_race' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    expect(verified.data.entitlements.status).toBe('active');

    const job = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!job.ok) {
      throw new Error('expected success');
    }
    const ran = await billfn.runReconciliationJob({ jobId: job.data.job.id });
    expect(ran.ok).toBe(true);
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
