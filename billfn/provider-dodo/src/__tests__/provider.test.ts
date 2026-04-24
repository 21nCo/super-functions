import { describe, expect, it, vi } from 'vitest';
import { createDodoProvider } from '../index.js';

describe('@billfn/provider-dodo', () => {
  it('creates a checkout request against the correct endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          payment_link: 'https://checkout.example.test',
          subscription_id: 'sub_123'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    ) as typeof fetch;

    const provider = createDodoProvider({
      apiKey: 'test-key',
      fetch: fetchMock
    });

    const response = await provider.createCheckout?.({
      checkoutSessionId: 'chk_123',
      billingAccount: {
        id: 'ba_user_123',
        ownerType: 'user',
        ownerId: 'user_123',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      plan: {
        productKey: 'nucleus',
        planKey: 'pro',
        displayName: 'Pro',
        features: {},
        limits: {},
        prices: []
      },
      price: {
        priceId: 'price_123',
        provider: 'dodo',
        providerProductId: 'pdt_123',
        amount: 12,
        currency: 'USD',
        interval: 'month',
        kind: 'subscription'
      }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.dodopayments.com/subscriptions',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(response?.providerSubscriptionId).toBe('sub_123');
  });

  it('issues refunds through the refunds endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          refund_id: 'rfd_123'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    ) as typeof fetch;

    const provider = createDodoProvider({
      apiKey: 'test-key',
      fetch: fetchMock
    });

    const response = await provider.refundCharge?.({
      billingAccount: {
        id: 'ba_user_123',
        ownerType: 'user',
        ownerId: 'user_123',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      providerChargeId: 'pay_123',
      mode: 'full'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.dodopayments.com/refunds',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(response?.operationStatus).toBe('applied');
    expect(response?.providerRefundId).toBe('rfd_123');
  });

  it('falls back to replacement checkout when direct change is unsupported', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value.endsWith('/subscriptions/sub_123')) {
        if (fetchMock.mock.calls.length === 1) {
          return new Response('unsupported', { status: 405 });
        }
        return new Response(
          JSON.stringify({
            subscription_id: 'sub_123',
            status: 'cancelled'
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const provider = createDodoProvider({
      apiKey: 'test-key',
      fetch: fetchMock
    });

    const response = await provider.changeSubscription?.({
      subscription: {
        id: 'sub_local',
        billingAccountId: 'ba_user_123',
        planKey: 'pro',
        priceId: 'price_old',
        provider: 'dodo',
        providerSubscriptionId: 'sub_123',
        status: 'active',
        autoRenew: true,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      currentPlan: {
        productKey: 'nucleus',
        planKey: 'pro',
        displayName: 'Pro',
        features: {},
        limits: {},
        prices: []
      },
      currentPrice: {
        priceId: 'price_old',
        provider: 'dodo',
        providerProductId: 'pdt_old',
        amount: 12,
        currency: 'USD',
        interval: 'month',
        kind: 'subscription'
      },
      targetPlan: {
        productKey: 'nucleus',
        planKey: 'pro',
        displayName: 'Pro',
        features: {},
        limits: {},
        prices: []
      },
      targetPrice: {
        priceId: 'price_new',
        provider: 'dodo',
        providerProductId: 'pdt_new',
        amount: 120,
        currency: 'USD',
        interval: 'year',
        kind: 'subscription'
      },
      effectiveAt: 'immediate',
      prorationBehavior: 'provider_default'
    });

    expect(response?.operationStatus).toBe('requires_action');
    expect(response?.clientAction?.type).toBe('redirect');
    expect(response?.raw).toMatchObject({
      fallback: 'replacement-checkout'
    });
  });
});
