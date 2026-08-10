import { describe, expect, it, vi } from 'vitest';
import type { BillFnChangeSubscriptionInput } from '@billfn/core';
import { createDodoProvider } from '../index.js';

function changeSubscriptionInput(): BillFnChangeSubscriptionInput {
  return {
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
  };
}

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
      'https://live.dodopayments.com/subscriptions',
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
      'https://live.dodopayments.com/refunds',
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
      if (value.endsWith('/subscriptions/sub_123/change-plan')) {
        if (fetchMock.mock.calls.length === 1) {
          return new Response('unsupported', { status: 405 });
        }
      }
      if (value.endsWith('/subscriptions/sub_123')) {
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
    const changeBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(changeBody).not.toHaveProperty('proration_billing_mode');
  });

  it('uses Dodo change-plan endpoint and schema for direct plan changes', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          subscription_id: 'sub_123',
          status: 'active'
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
      effectiveAt: 'next_renewal',
      prorationBehavior: 'none'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.dodopayments.com/subscriptions/sub_123/change-plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          product_id: 'pdt_new',
          proration_billing_mode: 'do_not_bill',
          quantity: 1,
          effective_at: 'next_billing_date'
        })
      })
    );
    expect(response?.operationStatus).toBe('applied');
  });

  it('surfaces transient change failures instead of canceling the live subscription', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream error', { status: 503 })) as typeof fetch;

    const provider = createDodoProvider({
      apiKey: 'test-key',
      fetch: fetchMock
    });

    await expect(
      provider.changeSubscription?.({
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
      })
    ).rejects.toMatchObject({
      code: 'BILLFN_PROVIDER_ERROR'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 409])('surfaces status %s without canceling the live subscription', async (status) => {
    const fetchMock = vi.fn(async () => new Response('provider rejection', { status })) as typeof fetch;
    const provider = createDodoProvider({
      apiKey: 'test-key',
      fetch: fetchMock
    });

    await expect(provider.changeSubscription?.(changeSubscriptionInput())).rejects.toMatchObject({
      code: 'BILLFN_PROVIDER_ERROR'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resumes subscriptions by clearing the next-billing cancellation flag', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          subscription_id: 'sub_123',
          status: 'active'
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

    const response = await provider.resumeSubscription?.({
      subscription: {
        id: 'sub_local',
        billingAccountId: 'ba_user_123',
        planKey: 'pro',
        priceId: 'price_old',
        provider: 'dodo',
        providerSubscriptionId: 'sub_123',
        status: 'active',
        autoRenew: false,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.dodopayments.com/subscriptions/sub_123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          cancel_at_next_billing_date: false
        })
      })
    );
    expect(response?.operationStatus).toBe('applied');
  });
});
