import { describe, expect, it, vi } from 'vitest';
import type { TransactionAdapter } from '@superfunctions/db';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { MemoryQueueAdapter } from '../../../../packages/queue/src/index.js';
import { createBillFn, createBillFnReconciliationWorker, getSchema } from '../index.js';
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
  it('keeps schema model names logical for custom namespaces and enforces provider reference uniqueness', () => {
    const schema = getSchema({ namespace: 'custom_billfn' });
    expect(schema.version).toBe(3);
    expect(schema.schemas.map((table) => table.modelName)).toContain('subscriptions');
    expect(schema.schemas.some((table) => table.modelName.startsWith('custom_billfn_'))).toBe(false);
    const subscriptions = schema.schemas.find((table) => table.modelName === 'subscriptions');
    expect(subscriptions?.indexes?.find(
      (index) => index.fields.join(',') === 'provider,providerSubscriptionId'
    )?.unique).toBe(true);
    expect(subscriptions?.indexes?.find(
      (index) => index.fields.join(',') === 'provider,providerChargeId'
    )?.unique).toBe(true);
    const receipts = schema.schemas.find((table) => table.modelName === 'webhookReceipts');
    expect(receipts?.fields.processingClaimedAt).toEqual({ type: 'string', required: false });
  });

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

  it('does not grant retained feature flags from an inactive entitlement snapshot', async () => {
    const db = memoryAdapter({ debug: false });
    const billfn = createBillFn({
      db,
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'inactive_feature_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'inactive_feature_user' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }

    await db.update({
      model: 'entitlementSnapshots',
      where: [{ field: 'billingAccountId', operator: 'eq', value: verified.data.subscription.billingAccountId }],
      data: { status: 'inactive' },
      namespace: 'billfn'
    });

    await expect(
      billfn.subscriptionProvider.hasFeature({ principalId: 'inactive_feature_user' }, 'sync')
    ).resolves.toBe(false);
  });

  it('rejects checkout verification when its provider reference belongs to another account', async () => {
    const baseProvider = createMockProvider('dodo');
    const db = memoryAdapter({ debug: false });
    const provider: BillFnProviderAdapter = {
      ...baseProvider,
      async verifyCheckout(input) {
        const verified = await baseProvider.verifyCheckout!(input);
        return {
          ...verified,
          providerSubscriptionId: 'provider_shared_subscription',
          providerChargeId: 'provider_shared_charge'
        };
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: { dodo: provider }
    });

    const ownerCheckout = await billfn.createCheckout({
      subject: { principalId: 'provider_ref_owner' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!ownerCheckout.ok) {
      throw new Error('expected success');
    }
    await billfn.verifyCheckout({
      subject: { principalId: 'provider_ref_owner' },
      checkoutSessionId: ownerCheckout.data.checkoutSession.checkoutSessionId
    });

    const attackerCheckout = await billfn.createCheckout({
      subject: { principalId: 'provider_ref_attacker' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!attackerCheckout.ok) {
      throw new Error('expected success');
    }
    await expect(billfn.verifyCheckout({
      subject: { principalId: 'provider_ref_attacker' },
      checkoutSessionId: attackerCheckout.data.checkoutSession.checkoutSessionId
    })).rejects.toMatchObject({
      code: 'BILLFN_CONFLICT'
    });
    const attackerSession = await db.findOne<{
      providerSubscriptionId?: string;
      providerChargeId?: string;
    }>({
      model: 'checkoutSessions',
      where: [{ field: 'checkoutSessionId', operator: 'eq', value: attackerCheckout.data.checkoutSession.checkoutSessionId }],
      namespace: 'billfn'
    });
    expect(attackerSession?.providerSubscriptionId).toBeUndefined();
    expect(attackerSession?.providerChargeId).toBeUndefined();
  });

  it('recovers subscription bootstrapping when a concurrent insert wins the provider reference', async () => {
    const db = memoryAdapter({ debug: false });
    let injected = false;
    const racingDb = {
      ...db,
      async create<T>(params: Parameters<typeof db.create>[0]): Promise<T> {
        if (params.model === 'subscriptions' && !injected) {
          injected = true;
          await db.create({
            ...params,
            data: {
              ...params.data,
              id: 'sub_concurrent_winner'
            }
          });
          throw new Error('UNIQUE constraint failed: subscriptions.provider, subscriptions.providerSubscriptionId');
        }
        return db.create<T>(params);
      }
    };
    const billfn = createBillFn({
      db: racingDb,
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'bootstrap_race' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }

    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'bootstrap_race' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    const subscriptions = await db.findMany({
      model: 'subscriptions',
      where: [],
      namespace: 'billfn'
    });

    expect(verified.ok && verified.data.subscription.id).toBe('sub_concurrent_winner');
    expect(subscriptions).toHaveLength(1);
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

  it('rejects a refund charge override that is not owned by the resolved subscription', async () => {
    const refundCharge = vi.fn(createMockProvider('dodo').refundCharge);
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: {
          ...createMockProvider('dodo'),
          refundCharge
        }
      }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'refund_owner' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    await billfn.verifyCheckout({
      subject: { principalId: 'refund_owner' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    await expect(billfn.refundCharge({
      subject: { principalId: 'refund_owner' },
      providerChargeId: 'charge_owned_by_someone_else',
      mode: 'full'
    })).rejects.toMatchObject({
      code: 'BILLFN_CONFLICT'
    });
    expect(refundCharge).not.toHaveBeenCalled();
  });

  it('rejects cross-provider subscription changes before invoking the provider', async () => {
    const changeSubscription = vi.fn(createMockProvider('dodo').changeSubscription);
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: {
          ...createMockProvider('dodo'),
          changeSubscription
        }
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_cross_provider' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    await billfn.verifyCheckout({
      subject: { principalId: 'user_cross_provider' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    await expect(billfn.changeSubscription({
      subject: { principalId: 'user_cross_provider' },
      targetPriceId: 'price_pro_apple_month'
    })).rejects.toMatchObject({
      code: 'BILLFN_VALIDATION_ERROR'
    });
    expect(changeSubscription).not.toHaveBeenCalled();
  });

  it('keeps current entitlements for changes scheduled at next renewal', async () => {
    let providerSubscriptionId = '';
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_scheduled_renewal',
          type: 'subscription.renewed',
          signatureVerified: true,
          occurredAt: '2026-05-20T00:00:00.000Z',
          priceId: 'pdt_pro_year',
          providerSubscriptionId,
          billingState: {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId,
            currentPeriodStart: '2026-05-20T00:00:00.000Z',
            currentPeriodEnd: '2027-05-20T00:00:00.000Z',
            autoRenew: true,
            raw: { product_id: 'pdt_pro_year' }
          },
          raw: { product_id: 'pdt_pro_year' }
        }];
      }
    };
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: provider
      }
    });

    const created = await billfn.createCheckout({
      subject: { principalId: 'user_scheduled_change' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    await billfn.verifyCheckout({
      subject: { principalId: 'user_scheduled_change' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });

    const changed = await billfn.changeSubscription({
      subject: { principalId: 'user_scheduled_change' },
      targetPriceId: 'price_pro_dodo_year',
      effectiveAt: 'next_renewal'
    });

    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error('expected success');
    }
    expect(changed.data.subscription.priceId).toBe('price_pro_dodo_month');
    expect(changed.data.entitlements.planKey).toBe('pro');

    providerSubscriptionId = changed.data.subscription.providerSubscriptionId ?? '';
    await billfn.handleWebhook({
      provider: 'dodo',
      rawBody: '{}',
      headers: new Headers()
    });
    const renewed = await billfn.getEntitlements({ principalId: 'user_scheduled_change' });
    expect(renewed.ok && renewed.data.subscription?.priceId).toBe('price_pro_dodo_year');
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

  it('maps malformed JSON request bodies to validation errors', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    const response = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/checkouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"planKey":'
      })
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('BILLFN_VALIDATION_ERROR');
  });

  it.each(['null', '[]', '"text"'])('rejects non-object JSON request body %s', async (body) => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });

    const response = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/checkouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      })
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
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
    const baseProvider = createMockProvider('dodo');
    const provider: BillFnProviderAdapter = {
      ...baseProvider,
      async verifyCheckout(input) {
        const result = await baseProvider.verifyCheckout!(input);
        return {
          ...result,
          providerChargeId: `charge_${input.checkoutSession.checkoutSessionId}`
        };
      },
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
      priceId: 'price_pro_dodo_month',
      purchaseReference: 'restore_batch'
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      throw new Error('expected success');
    }
    expect(restored.data.subscription.providerSubscriptionId).toBe(matchingProviderSubscriptionId);
  });

  it('bootstraps local subscription state from a provider-verified restored purchase', async () => {
    const db = memoryAdapter({ debug: false });
    const billfn = createBillFn({
      db,
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });

    const restored = await billfn.restorePurchases({
      subject: { principalId: 'restore_new_deployment' },
      planKey: 'pro',
      provider: 'dodo',
      priceId: 'price_pro_dodo_month',
      purchaseReference: 'provider_purchase_without_local_state'
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      throw new Error('expected success');
    }
    expect(restored.data.subscription.providerSubscriptionId).toBe(
      'restored_provider_purchase_without_local_state'
    );
    expect(restored.data.entitlements.status).toBe('active');
    await expect(
      db.findMany({
        model: 'subscriptions',
        where: [{ field: 'billingAccountId', operator: 'eq', value: restored.data.subscription.billingAccountId }],
        namespace: 'billfn'
      })
    ).resolves.toHaveLength(1);
  });

  it('requires a restore price discriminator when a provider has multiple prices', async () => {
    const billfn = createBillFn({
      db: memoryAdapter({ debug: false }),
      catalog,
      providers: {
        dodo: createMockProvider('dodo')
      }
    });

    await expect(billfn.restorePurchases({
      subject: { principalId: 'restore_ambiguous' },
      planKey: 'pro',
      provider: 'dodo',
      purchaseReference: 'provider_purchase_without_checkout'
    })).rejects.toMatchObject({
      code: 'BILLFN_VALIDATION_ERROR'
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

  it('atomically prevents an older provider event from replacing newer subscription state', async () => {
    let providerSubscriptionId = '';
    const db = memoryAdapter({ debug: false });
    let releaseOlderCas!: () => void;
    let markOlderCasStarted!: () => void;
    let releaseOlderEntitlementCas!: () => void;
    let markOlderEntitlementCasStarted!: () => void;
    const olderCasStarted = new Promise<void>((resolve) => {
      markOlderCasStarted = resolve;
    });
    const olderCasRelease = new Promise<void>((resolve) => {
      releaseOlderCas = resolve;
    });
    const olderEntitlementCasStarted = new Promise<void>((resolve) => {
      markOlderEntitlementCasStarted = resolve;
    });
    const olderEntitlementCasRelease = new Promise<void>((resolve) => {
      releaseOlderEntitlementCas = resolve;
    });
    let delayedOlderCas = false;
    let delayedOlderEntitlementCas = false;
    const racingDb = {
      ...db,
      async updateMany(params: Parameters<typeof db.updateMany>[0]): Promise<number> {
        if (
          !delayedOlderCas &&
          params.model === 'subscriptions' &&
          params.data.status === 'canceled' &&
          params.where.some((clause) => clause.field === 'updatedAt')
        ) {
          delayedOlderCas = true;
          markOlderCasStarted();
          await olderCasRelease;
        }
        if (
          !delayedOlderEntitlementCas &&
          params.model === 'entitlementSnapshots' &&
          params.data.status === 'inactive' &&
          params.where.some((clause) => clause.field === 'sourceEventId')
        ) {
          delayedOlderEntitlementCas = true;
          markOlderEntitlementCasStarted();
          await olderEntitlementCasRelease;
        }
        return db.updateMany(params);
      }
    };
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook(input) {
        const payload = JSON.parse(input.rawBody) as {
          id: string;
          occurredAt: string;
          status: 'active' | 'canceled';
        };
        return [{
          providerEventId: payload.id,
          type: 'subscription.updated',
          signatureVerified: true,
          occurredAt: payload.occurredAt,
          providerSubscriptionId,
          billingState: {
            subscriptionStatus: payload.status,
            checkoutStatus: 'succeeded',
            providerSubscriptionId,
            currentPeriodStart: payload.occurredAt,
            currentPeriodEnd: '2026-07-20T00:00:00.000Z',
            autoRenew: payload.status === 'active'
          },
          raw: payload
        }];
      }
    };
    const billfn = createBillFn({
      db: racingDb,
      catalog,
      providers: { dodo: provider }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'out_of_order_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'out_of_order_user' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    providerSubscriptionId = verified.data.subscription.providerSubscriptionId ?? '';

    const older = billfn.handleWebhook({
      provider: 'dodo',
      rawBody: JSON.stringify({
        id: 'evt_older',
        occurredAt: '2026-05-20T00:00:00.000Z',
        status: 'canceled'
      }),
      headers: new Headers()
    });
    await olderCasStarted;
    const newer = await billfn.handleWebhook({
      provider: 'dodo',
      rawBody: JSON.stringify({
        id: 'evt_newer',
        occurredAt: '2026-06-20T00:00:00.000Z',
        status: 'active'
      }),
      headers: new Headers()
    });
    releaseOlderCas();
    const olderResult = await older;

    const current = await billfn.getEntitlements({ principalId: 'out_of_order_user' });
    expect(newer.ok).toBe(true);
    expect(olderResult.ok).toBe(true);
    expect(current.ok && current.data.subscription?.status).toBe('active');
    expect(current.ok && current.data.entitlements?.status).toBe('active');

    const olderWithCommittedSubscription = billfn.handleWebhook({
      provider: 'dodo',
      rawBody: JSON.stringify({
        id: 'evt_older_committed',
        occurredAt: '2026-07-20T00:00:00.000Z',
        status: 'canceled'
      }),
      headers: new Headers()
    });
    await olderEntitlementCasStarted;
    const newest = await billfn.handleWebhook({
      provider: 'dodo',
      rawBody: JSON.stringify({
        id: 'evt_newest',
        occurredAt: '2026-08-20T00:00:00.000Z',
        status: 'active'
      }),
      headers: new Headers()
    });
    releaseOlderEntitlementCas();
    const olderCommittedResult = await olderWithCommittedSubscription;

    const final = await billfn.getEntitlements({ principalId: 'out_of_order_user' });
    expect(newest.ok).toBe(true);
    expect(olderCommittedResult.ok).toBe(true);
    expect(final.ok && final.data.subscription?.status).toBe('active');
    expect(final.ok && final.data.entitlements?.status).toBe('active');
  });

  it('does not enqueue a second job for a duplicate webhook receipt still being processed', async () => {
    const db = memoryAdapter({ debug: false });
    const queue = new MemoryQueueAdapter();
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_pending_duplicate',
          type: 'subscription.updated',
          signatureVerified: true,
          raw: { ok: true }
        }];
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      queue,
      providers: { dodo: provider }
    });

    const deliveries = await Promise.all([
      billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() }),
      billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() })
    ]);
    const jobs = await db.findMany({
      model: 'reconciliationJobs',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_pending_duplicate' }],
      namespace: 'billfn'
    });

    expect(deliveries.map((delivery) => delivery.ok ? delivery.data.processed : -1).sort()).toEqual([0, 1]);
    expect(jobs).toHaveLength(1);
    expect(queue.size('billfn-reconciliation')).toBe(1);
  });

  it('reclaims an unfinished webhook receipt after its processing lease expires', async () => {
    const db = memoryAdapter({ debug: false });
    const queue = new MemoryQueueAdapter();
    let currentTime = new Date('2026-04-20T00:00:00.000Z');
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_stale_claim',
          type: 'subscription.updated',
          signatureVerified: true,
          raw: { ok: true }
        }];
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      queue,
      now: () => currentTime,
      providers: { dodo: provider }
    });

    await billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });
    await queue.dequeue('billfn-reconciliation');
    const firstReceipt = await db.findOne<{ processingJobId: string; processingClaimedAt: string }>({
      model: 'webhookReceipts',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_stale_claim' }],
      namespace: 'billfn'
    });
    currentTime = new Date(currentTime.getTime() + 16 * 60 * 1000);

    const retried = await billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });
    const reclaimedReceipt = await db.findOne<{ processingJobId: string; processingClaimedAt: string }>({
      model: 'webhookReceipts',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_stale_claim' }],
      namespace: 'billfn'
    });
    const jobs = await db.findMany({
      model: 'reconciliationJobs',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_stale_claim' }],
      namespace: 'billfn'
    });

    expect(retried.ok && retried.data.processed).toBe(1);
    expect(reclaimedReceipt?.processingJobId).not.toBe(firstReceipt?.processingJobId);
    expect(reclaimedReceipt?.processingClaimedAt).toBe('2026-04-20T00:16:00.000Z');
    expect(jobs).toHaveLength(2);
    expect(queue.size('billfn-reconciliation')).toBe(1);
  });

  it('re-enqueues an unfinished webhook receipt after its prior job failed', async () => {
    const db = memoryAdapter({ debug: false });
    const queue = new MemoryQueueAdapter();
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_failed_redelivery',
          type: 'subscription.updated',
          signatureVerified: true,
          providerSubscriptionId: 'sub_missing',
          billingState: {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId: 'sub_missing',
            autoRenew: true
          },
          raw: { delivery: 'latest' }
        }];
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      queue,
      providers: { dodo: provider }
    });
    await billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });
    await queue.dequeue('billfn-reconciliation');
    const firstJob = await db.findOne<{ id: string }>({
      model: 'reconciliationJobs',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_failed_redelivery' }],
      namespace: 'billfn'
    });
    await expect(billfn.runReconciliationJob({ jobId: firstJob?.id ?? '' })).rejects.toMatchObject({
      code: 'BILLFN_NOT_FOUND'
    });

    const retried = await billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });
    const jobs = await db.findMany({
      model: 'reconciliationJobs',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_failed_redelivery' }],
      namespace: 'billfn'
    });

    expect(retried.ok && retried.data.processed).toBe(1);
    expect(jobs).toHaveLength(2);
    expect(queue.size('billfn-reconciliation')).toBe(1);
  });

  it('fails a webhook job when another worker replaces its receipt lease before finalization', async () => {
    const db = memoryAdapter({ debug: false });
    const queue = new MemoryQueueAdapter();
    let replaceLease = true;
    const leaseLosingDb = {
      ...db,
      async updateMany(params: Parameters<typeof db.updateMany>[0]): Promise<number> {
        const expectedClaim = params.where.find((clause) => clause.field === 'processingJobId');
        const receiptId = params.where.find((clause) => clause.field === 'id');
        if (
          replaceLease &&
          params.model === 'webhookReceipts' &&
          expectedClaim &&
          receiptId &&
          'processedAt' in params.data
        ) {
          replaceLease = false;
          await db.updateMany({
            model: params.model,
            where: [{ field: 'id', operator: 'eq', value: receiptId.value }],
            data: {
              processingJobId: 'replacement_job',
              processingClaimedAt: '2026-04-20T00:05:00.000Z'
            },
            namespace: params.namespace
          });
        }
        return db.updateMany(params);
      }
    };
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_lost_lease',
          type: 'subscription.updated',
          signatureVerified: true,
          raw: { ok: true }
        }];
      }
    };
    const billfn = createBillFn({
      db: leaseLosingDb,
      catalog,
      queue,
      providers: { dodo: provider }
    });

    await billfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });
    const job = await db.findOne<{ id: string }>({
      model: 'reconciliationJobs',
      where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_lost_lease' }],
      namespace: 'billfn'
    });

    await expect(billfn.runReconciliationJob({ jobId: job?.id ?? '' })).rejects.toMatchObject({
      code: 'BILLFN_CONFLICT'
    });
    await expect(
      db.findOne<{ processingJobId: string }>({
        model: 'webhookReceipts',
        where: [{ field: 'providerEventId', operator: 'eq', value: 'evt_lost_lease' }],
        namespace: 'billfn'
      })
    ).resolves.toMatchObject({ processingJobId: 'replacement_job' });
    await expect(
      db.findOne<{ status: string }>({
        model: 'reconciliationJobs',
        where: [{ field: 'id', operator: 'eq', value: job?.id }],
        namespace: 'billfn'
      })
    ).resolves.toMatchObject({ status: 'failed' });
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

    const invalidWebhookJob = await billfn.router.handle(
      new Request('https://billfn.example.test/billfn/ops/reconciliation/jobs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ops-key': 'secret'
        },
        body: JSON.stringify({
          kind: 'webhook-event',
          provider: 'dodo',
          providerEventId: 'evt_ops'
        })
      })
    );
    expect(invalidWebhookJob.status).toBe(400);
    await expect(invalidWebhookJob.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'BILLFN_VALIDATION_ERROR',
        message: expect.stringContaining('webhook-replay')
      }
    });

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

  it('allows only one runner to claim and process a reconciliation job', async () => {
    const db = memoryAdapter({ debug: false });
    const baseProvider = createMockProvider('dodo');
    let fetchCalls = 0;
    let notifyFetchStarted!: () => void;
    let releaseFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      notifyFetchStarted = resolve;
    });
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const provider: BillFnProviderAdapter = {
      ...baseProvider,
      async fetchSubscription(input) {
        fetchCalls += 1;
        notifyFetchStarted();
        await fetchGate;
        return baseProvider.fetchSubscription!(input);
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: { dodo: provider }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'single_job_runner' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'single_job_runner' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    const enqueued = await billfn.enqueueReconciliationJob({
      kind: 'subscription-sync',
      provider: 'dodo',
      subscriptionId: verified.data.subscription.id
    });
    if (!enqueued.ok) {
      throw new Error('expected success');
    }

    const firstRun = billfn.runReconciliationJob({ jobId: enqueued.data.job.id });
    await fetchStarted;
    await expect(
      billfn.runReconciliationJob({ jobId: enqueued.data.job.id })
    ).rejects.toMatchObject({ code: 'BILLFN_CONFLICT' });
    releaseFetch();

    await expect(firstRun).resolves.toMatchObject({
      ok: true,
      data: { job: { status: 'succeeded', attempts: 1 } }
    });
    expect(fetchCalls).toBe(1);
  });

  it('reclaims a reconciliation job after its running lease expires', async () => {
    const db = memoryAdapter({ debug: false });
    let currentTime = new Date('2026-04-20T00:16:00.000Z');
    await db.create({
      model: 'reconciliationJobs',
      data: {
        id: 'job_stale_running',
        kind: 'account-scan',
        status: 'running',
        billingAccountId: 'ba_stale_running',
        attempts: 1,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      namespace: 'billfn'
    });
    const billfn = createBillFn({
      db,
      catalog,
      now: () => currentTime
    });

    await expect(
      billfn.runReconciliationJob({ jobId: 'job_stale_running' })
    ).resolves.toMatchObject({
      ok: true,
      data: { job: { status: 'succeeded', attempts: 2 } }
    });

    currentTime = new Date('2026-04-20T00:17:00.000Z');
    await expect(
      billfn.runReconciliationJob({ jobId: 'job_stale_running' })
    ).resolves.toMatchObject({
      ok: true,
      data: { job: { status: 'succeeded', attempts: 2 } }
    });
  });

  it('fences an expired reconciliation runner before it can project after reclamation', async () => {
    const db = memoryAdapter({ debug: false });
    const baseProvider = createMockProvider('dodo');
    let currentTime = new Date('2026-04-20T00:00:00.000Z');
    let fetchCalls = 0;
    let notifyFirstFetch!: () => void;
    let releaseFirstFetch!: () => void;
    const firstFetchStarted = new Promise<void>((resolve) => {
      notifyFirstFetch = resolve;
    });
    const firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    const provider: BillFnProviderAdapter = {
      ...baseProvider,
      async fetchSubscription(input) {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          notifyFirstFetch();
          await firstFetchGate;
        }
        return baseProvider.fetchSubscription!(input);
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      now: () => currentTime,
      providers: { dodo: provider }
    });
    const created = await billfn.createCheckout({
      subject: { principalId: 'fenced_runner' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await billfn.verifyCheckout({
      subject: { principalId: 'fenced_runner' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    const enqueued = await billfn.enqueueReconciliationJob({
      kind: 'subscription-sync',
      provider: 'dodo',
      subscriptionId: verified.data.subscription.id
    });
    if (!enqueued.ok) {
      throw new Error('expected success');
    }
    const eventsBefore = await db.findMany<{ type: string }>({
      model: 'billingEvents',
      where: [{ field: 'type', operator: 'eq', value: 'billfn.subscription.active' }],
      namespace: 'billfn'
    });

    const expiredRun = billfn.runReconciliationJob({ jobId: enqueued.data.job.id });
    await firstFetchStarted;
    currentTime = new Date('2026-04-20T00:16:00.000Z');

    await expect(
      billfn.runReconciliationJob({ jobId: enqueued.data.job.id })
    ).resolves.toMatchObject({
      ok: true,
      data: { job: { status: 'succeeded', attempts: 2 } }
    });
    releaseFirstFetch();
    await expect(expiredRun).rejects.toMatchObject({ code: 'BILLFN_CONFLICT' });

    const eventsAfter = await db.findMany<{ type: string }>({
      model: 'billingEvents',
      where: [{ field: 'type', operator: 'eq', value: 'billfn.subscription.active' }],
      namespace: 'billfn'
    });
    expect(eventsAfter).toHaveLength(eventsBefore.length + 1);
    expect(fetchCalls).toBe(2);
  });

  it('lets only one overlapping webhook replay hold the receipt claim', async () => {
    const db = memoryAdapter({ debug: false });
    let providerSubscriptionId = '';
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async parseWebhook() {
        return [{
          providerEventId: 'evt_overlapping_replay',
          type: 'subscription.updated',
          signatureVerified: true,
          providerSubscriptionId,
          billingState: {
            subscriptionStatus: 'active',
            checkoutStatus: 'succeeded',
            providerSubscriptionId,
            currentPeriodStart: '2026-04-20T00:00:00.000Z',
            currentPeriodEnd: '2026-05-20T00:00:00.000Z',
            autoRenew: true
          },
          raw: { ok: true }
        }];
      }
    };
    const setupBillfn = createBillFn({ db, catalog, providers: { dodo: provider } });
    const created = await setupBillfn.createCheckout({
      subject: { principalId: 'replay_user' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });
    if (!created.ok) {
      throw new Error('expected success');
    }
    const verified = await setupBillfn.verifyCheckout({
      subject: { principalId: 'replay_user' },
      checkoutSessionId: created.data.checkoutSession.checkoutSessionId
    });
    if (!verified.ok) {
      throw new Error('expected success');
    }
    providerSubscriptionId = verified.data.subscription.providerSubscriptionId ?? '';
    await setupBillfn.handleWebhook({ provider: 'dodo', rawBody: '{}', headers: new Headers() });

    let firstReplayJobId = '';
    let notifyFirstClaim!: () => void;
    let releaseFirstClaim!: () => void;
    const firstClaimed = new Promise<void>((resolve) => {
      notifyFirstClaim = resolve;
    });
    const firstClaimGate = new Promise<void>((resolve) => {
      releaseFirstClaim = resolve;
    });
    const gatedDb = {
      ...db,
      async updateMany(params: Parameters<typeof db.updateMany>[0]): Promise<number> {
        const affected = await db.updateMany(params);
        if (
          params.model === 'webhookReceipts' &&
          String(params.data.processingJobId).startsWith(`${firstReplayJobId}:attempt:`) &&
          affected === 1
        ) {
          notifyFirstClaim();
          await firstClaimGate;
        }
        return affected;
      }
    };
    const billfn = createBillFn({ db: gatedDb, catalog, providers: { dodo: provider } });
    const firstReplay = await billfn.enqueueReconciliationJob({
      kind: 'webhook-replay',
      provider: 'dodo',
      providerEventId: 'evt_overlapping_replay'
    });
    const secondReplay = await billfn.enqueueReconciliationJob({
      kind: 'webhook-replay',
      provider: 'dodo',
      providerEventId: 'evt_overlapping_replay'
    });
    if (!firstReplay.ok || !secondReplay.ok) {
      throw new Error('expected success');
    }
    firstReplayJobId = firstReplay.data.job.id;
    const eventsBefore = await db.findMany({
      model: 'billingEvents',
      where: [{ field: 'type', operator: 'eq', value: 'billfn.subscription.active' }],
      namespace: 'billfn'
    });

    const firstRun = billfn.runReconciliationJob({ jobId: firstReplay.data.job.id });
    await firstClaimed;
    await expect(
      billfn.runReconciliationJob({ jobId: secondReplay.data.job.id })
    ).resolves.toMatchObject({ ok: true, data: { job: { status: 'succeeded' } } });
    releaseFirstClaim();
    await expect(firstRun).resolves.toMatchObject({ ok: true, data: { job: { status: 'succeeded' } } });

    const eventsAfter = await db.findMany({
      model: 'billingEvents',
      where: [{ field: 'type', operator: 'eq', value: 'billfn.subscription.active' }],
      namespace: 'billfn'
    });
    expect(eventsAfter).toHaveLength(eventsBefore.length + 1);
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

  it('retries notification-history receipts that are still pending', async () => {
    const db = memoryAdapter({ debug: false });
    const eventId = 'evt_history_pending';
    await db.create({
      model: 'webhookReceipts',
      namespace: 'billfn',
      data: {
        id: `whr_dodo_${Buffer.from(eventId).toString('base64url')}`,
        provider: 'dodo',
        providerEventId: eventId,
        eventType: 'subscription.updated',
        signatureVerified: true,
        rawPayload: { raw: {} },
        createdAt: '2026-04-20T00:00:00.000Z',
        processingJobId: null,
        processingClaimedAt: null,
        processedAt: null
      }
    });
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async fetchNotificationHistory() {
        return {
          events: [{
            providerEventId: eventId,
            type: 'subscription.updated',
            signatureVerified: true,
            raw: { ok: true }
          }]
        };
      }
    };
    const billfn = createBillFn({
      db,
      catalog,
      providers: { dodo: provider }
    });
    const job = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!job.ok) {
      throw new Error('expected success');
    }

    const ran = await billfn.runReconciliationJob({ jobId: job.data.job.id });
    const receipt = await db.findOne<{ processedAt?: string }>({
      model: 'webhookReceipts',
      namespace: 'billfn',
      where: [{ field: 'providerEventId', operator: 'eq', value: eventId }]
    });

    expect(ran.ok).toBe(true);
    expect(receipt?.processedAt).toEqual(expect.any(String));
  });

  it('releases notification-history claims when refreshing a receipt fails', async () => {
    const db = memoryAdapter({ debug: false });
    const eventId = 'evt_history_refresh_failure';
    let refreshFailed = false;
    const failingDb = {
      ...db,
      async update<T>(params: Parameters<typeof db.update>[0]): Promise<T> {
        if (
          params.model === 'webhookReceipts' &&
          'rawPayload' in params.data &&
          !refreshFailed
        ) {
          refreshFailed = true;
          throw new Error('receipt refresh failed');
        }
        return db.update<T>(params);
      }
    };
    const provider: BillFnProviderAdapter = {
      ...createMockProvider('dodo'),
      async fetchNotificationHistory() {
        return {
          events: [{
            providerEventId: eventId,
            type: 'subscription.updated',
            signatureVerified: true,
            raw: { ok: true }
          }]
        };
      }
    };
    const billfn = createBillFn({
      db: failingDb,
      catalog,
      providers: { dodo: provider }
    });
    const first = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!first.ok) {
      throw new Error('expected success');
    }

    await expect(billfn.runReconciliationJob({ jobId: first.data.job.id })).rejects.toThrow('receipt refresh failed');
    const released = await db.findOne<{ processingJobId?: string | null }>({
      model: 'webhookReceipts',
      namespace: 'billfn',
      where: [{ field: 'providerEventId', operator: 'eq', value: eventId }]
    });
    expect(released?.processingJobId).toBeNull();

    const second = await billfn.enqueueReconciliationJob({
      kind: 'notification-history-backfill',
      provider: 'dodo'
    });
    if (!second.ok) {
      throw new Error('expected success');
    }
    const ran = await billfn.runReconciliationJob({ jobId: second.data.job.id });
    const processed = await db.findOne<{ processedAt?: string | null }>({
      model: 'webhookReceipts',
      namespace: 'billfn',
      where: [{ field: 'providerEventId', operator: 'eq', value: eventId }]
    });

    expect(ran.ok).toBe(true);
    expect(processed?.processedAt).toEqual(expect.any(String));
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
          if (params.model === 'entitlementSnapshots') {
            throw Object.assign(new Error('Prisma unique constraint'), { code: 'P2002' });
          }
          throw Object.assign(new Error('Kysely insert failed'), {
            cause: Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
          });
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

  it('retries concurrent usage updates and floors signed usage deltas at zero', async () => {
    const db = memoryAdapter({ debug: false });
    let usageCasCalls = 0;
    const casOnlyDb = {
      ...db,
      async update<T>(params: Parameters<typeof db.update>[0]): Promise<T> {
        if (params.model === 'usageMeters') {
          throw new Error('usage updates must use affected-row CAS');
        }
        return db.update<T>(params);
      },
      async updateMany(params: Parameters<typeof db.updateMany>[0]): Promise<number> {
        if (params.model === 'usageMeters') {
          usageCasCalls += 1;
        }
        return db.updateMany(params);
      },
      async transaction<R>(callback: (transaction: TransactionAdapter) => Promise<R>): Promise<R> {
        return db.transaction(async (transaction) => callback({
          ...transaction,
          async update<T>(params: Parameters<typeof transaction.update>[0]): Promise<T> {
            if (params.model === 'usageMeters') {
              throw new Error('usage updates must use affected-row CAS');
            }
            return transaction.update<T>(params);
          },
          async updateMany(params: Parameters<typeof transaction.updateMany>[0]): Promise<number> {
            if (params.model === 'usageMeters') {
              usageCasCalls += 1;
            }
            return transaction.updateMany(params);
          }
        } as TransactionAdapter));
      }
    };
    const billfn = createBillFn({
      db: casOnlyDb,
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
    expect(usageCasCalls).toBeGreaterThan(0);

    await billfn.quotaProvider.recordUsage({
      principalId: 'usage_user',
      bytes: -10
    });
    await expect(billfn.quotaProvider.getUsage('usage_user')).resolves.toMatchObject({ current: 15 });

    await billfn.quotaProvider.recordUsage({
      principalId: 'usage_user',
      bytes: -100
    });
    await expect(billfn.quotaProvider.getUsage('usage_user')).resolves.toMatchObject({ current: 0 });

    await billfn.quotaProvider.recordUsage({
      principalId: 'usage_user',
      bytes: -1
    });
    await expect(billfn.quotaProvider.getUsage('usage_user')).resolves.toMatchObject({ current: 0 });

    await expect(billfn.quotaProvider.recordUsage({
      principalId: 'usage_user',
      bytes: Number.NaN
    })).rejects.toMatchObject({
      code: 'BILLFN_VALIDATION_ERROR'
    });
  });

  it('rolls back a usage meter increment when its ledger write fails', async () => {
    const db = memoryAdapter({ debug: false });
    let failLedgerWrite = true;
    const failingLedgerDb = {
      ...db,
      async transaction<R>(callback: (transaction: TransactionAdapter) => Promise<R>): Promise<R> {
        return db.transaction(async (transaction) => callback({
          ...transaction,
          async create<T>(params: Parameters<typeof transaction.create>[0]): Promise<T> {
            if (failLedgerWrite && params.model === 'usageLedger') {
              throw new Error('ledger write failed');
            }
            return transaction.create<T>(params);
          }
        } as TransactionAdapter));
      }
    };
    const billfn = createBillFn({
      db: failingLedgerDb,
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });

    await expect(
      billfn.quotaProvider.recordUsage({
        principalId: 'usage_rollback_user',
        bytes: 7
      })
    ).rejects.toThrow('ledger write failed');
    await expect(
      db.findMany({ model: 'usageMeters', where: [], namespace: 'billfn' })
    ).resolves.toHaveLength(0);
    await expect(
      db.findMany({ model: 'usageLedger', where: [], namespace: 'billfn' })
    ).resolves.toHaveLength(0);

    failLedgerWrite = false;
    await billfn.quotaProvider.recordUsage({
      principalId: 'usage_rollback_user',
      bytes: 7
    });

    await expect(
      billfn.quotaProvider.getUsage('usage_rollback_user')
    ).resolves.toMatchObject({ current: 7 });
    await expect(
      db.findMany({ model: 'usageLedger', where: [], namespace: 'billfn' })
    ).resolves.toHaveLength(1);
  });

  it('records usage without transactions and compensates a failed ledger write', async () => {
    const db = memoryAdapter({ debug: false });
    let failLedgerWrite = true;
    const nonTransactionalDb = {
      ...db,
      capabilities: {
        ...db.capabilities,
        transactions: {
          ...db.capabilities.transactions,
          supported: false
        }
      },
      async transaction(): Promise<never> {
        throw new Error('transaction should not be called');
      },
      async create<T>(params: Parameters<typeof db.create>[0]): Promise<T> {
        if (failLedgerWrite && params.model === 'usageLedger') {
          throw new Error('ledger write failed');
        }
        return db.create<T>(params);
      }
    };
    const billfn = createBillFn({
      db: nonTransactionalDb,
      catalog,
      providers: { dodo: createMockProvider('dodo') }
    });

    await expect(billfn.quotaProvider.recordUsage({
      principalId: 'usage_non_transactional_user',
      bytes: 7
    })).rejects.toThrow('ledger write failed');
    await expect(
      billfn.quotaProvider.getUsage('usage_non_transactional_user')
    ).resolves.toMatchObject({ current: 0 });
    await expect(
      db.findMany({ model: 'usageLedger', where: [], namespace: 'billfn' })
    ).resolves.toHaveLength(0);

    failLedgerWrite = false;
    await billfn.quotaProvider.recordUsage({
      principalId: 'usage_non_transactional_user',
      bytes: 7
    });

    await expect(
      billfn.quotaProvider.getUsage('usage_non_transactional_user')
    ).resolves.toMatchObject({ current: 7 });
    await expect(
      db.findMany({ model: 'usageLedger', where: [], namespace: 'billfn' })
    ).resolves.toHaveLength(1);
  });
});
