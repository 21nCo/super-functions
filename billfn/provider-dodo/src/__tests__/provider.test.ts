import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { BillFnChangeSubscriptionInput, BillFnRestorePurchasesInput } from '@billfn/core';
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

function restorePurchasesInput(): BillFnRestorePurchasesInput {
  return {
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
    },
    purchaseReference: 'sub_123'
  };
}

function standardWebhookHeaders(rawBody: string, id = 'evt_dodo_123') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = Buffer.from('dodo-webhook-secret');
  const signature = createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  return {
    secret: `whsec_${secretBytes.toString('base64')}`,
    headers: new Headers({
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`
    })
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
      },
      metadata: {
        campaign: 'launch',
        billfn_billing_account_id: 'ba_attacker'
      }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.dodopayments.com/subscriptions',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      product_id: 'pdt_123',
      metadata: {
        campaign: 'launch',
        billfn_checkout_session_id: 'chk_123',
        billfn_billing_account_id: 'ba_user_123',
        billfn_product_id: 'pdt_123'
      }
    });
    expect(response?.providerSubscriptionId).toBe('sub_123');
  });

  it('uses a server-recorded Dodo reference and verifies its checkout ownership', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      subscription_id: 'sub_server',
      product_id: 'pdt_123',
      status: 'active',
      metadata: {
        billfn_checkout_session_id: 'chk_123',
        billfn_billing_account_id: 'ba_user_123',
        billfn_product_id: 'pdt_123'
      }
    }), { status: 200 })) as typeof fetch;
    const provider = createDodoProvider({ apiKey: 'test-key', fetch: fetchMock });

    const result = await provider.verifyCheckout?.({
      checkoutSession: {
        checkoutSessionId: 'chk_123', billingAccountId: 'ba_user_123', planKey: 'pro', priceId: 'price_123',
        provider: 'dodo', providerSubscriptionId: 'sub_server', status: 'requires_action',
        createdAt: '2026-04-20T00:00:00.000Z', updatedAt: '2026-04-20T00:00:00.000Z'
      },
      billingAccount: {
        id: 'ba_user_123', ownerType: 'user', ownerId: 'user_123', createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      plan: { productKey: 'nucleus', planKey: 'pro', displayName: 'Pro', features: {}, limits: {}, prices: [] },
      price: {
        priceId: 'price_123', provider: 'dodo', providerProductId: 'pdt_123', amount: 12, currency: 'USD',
        interval: 'month', kind: 'subscription'
      },
      payload: { subscriptionId: 'sub_attacker' }
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/subscriptions/sub_server');
    expect(result?.providerSubscriptionId).toBe('sub_server');
  });

  it('rejects a Dodo resource that is not bound to the checkout billing account', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      subscription_id: 'sub_payload',
      product_id: 'pdt_123',
      status: 'active',
      metadata: {
        billfn_checkout_session_id: 'chk_123',
        billfn_billing_account_id: 'ba_other',
        billfn_product_id: 'pdt_123'
      }
    }), { status: 200 })) as typeof fetch;
    const provider = createDodoProvider({ apiKey: 'test-key', fetch: fetchMock });

    await expect(provider.verifyCheckout?.({
      checkoutSession: {
        checkoutSessionId: 'chk_123', billingAccountId: 'ba_user_123', planKey: 'pro', priceId: 'price_123',
        provider: 'dodo', status: 'requires_action', createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      billingAccount: {
        id: 'ba_user_123', ownerType: 'user', ownerId: 'user_123', createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      plan: { productKey: 'nucleus', planKey: 'pro', displayName: 'Pro', features: {}, limits: {}, prices: [] },
      price: {
        priceId: 'price_123', provider: 'dodo', providerProductId: 'pdt_123', amount: 12, currency: 'USD',
        interval: 'month', kind: 'subscription'
      },
      payload: { subscriptionId: 'sub_payload' }
    })).rejects.toMatchObject({ code: 'BILLFN_CONFLICT' });
  });

  it('validates the Dodo purchase reference, billing account, and product before restoring', async () => {
    const matchingMetadata = {
      billfn_billing_account_id: 'ba_user_123',
      billfn_product_id: 'pdt_123'
    };
    const invalidResources = [
      {
        subscription_id: 'sub_other',
        product_id: 'pdt_123',
        metadata: matchingMetadata
      },
      {
        subscription_id: 'sub_123',
        product_id: 'pdt_other',
        metadata: matchingMetadata
      },
      {
        subscription_id: 'sub_123',
        product_id: 'pdt_123',
        metadata: { ...matchingMetadata, billfn_billing_account_id: 'ba_other' }
      }
    ];

    for (const resource of invalidResources) {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(resource), { status: 200 })) as typeof fetch;
      const provider = createDodoProvider({ apiKey: 'test-key', fetch: fetchMock });

      await expect(provider.restorePurchases?.(restorePurchasesInput())).rejects.toMatchObject({
        code: 'BILLFN_CONFLICT'
      });
    }
  });

  it('restores a Dodo purchase only when its ownership metadata matches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      subscription_id: 'sub_123',
      product_id: 'pdt_123',
      status: 'active',
      metadata: {
        billfn_billing_account_id: 'ba_user_123',
        billfn_product_id: 'pdt_123'
      }
    }), { status: 200 })) as typeof fetch;
    const provider = createDodoProvider({ apiKey: 'test-key', fetch: fetchMock });

    await expect(provider.restorePurchases?.(restorePurchasesInput())).resolves.toEqual([
      expect.objectContaining({ providerSubscriptionId: 'sub_123' })
    ]);
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
    expect(changeBody.proration_billing_mode).toBe('prorated_immediately');
  });

  it('verifies Dodo webhooks with the Standard Webhooks headers and signed message', async () => {
    const rawBody = JSON.stringify({
      type: 'subscription.renewed',
      timestamp: '2026-08-10T17:30:00.000Z',
      data: {
        subscription_id: 'sub_123',
        payment_id: 'pay_123',
        product_id: 'pdt_new',
        status: 'active'
      }
    });
    const { secret, headers } = standardWebhookHeaders(rawBody);
    const provider = createDodoProvider({
      apiKey: 'test-key',
      webhookSecret: secret
    });

    const events = await provider.parseWebhook?.({ rawBody, headers });

    expect(events?.[0]).toMatchObject({
      providerEventId: 'evt_dodo_123',
      type: 'subscription.renewed',
      signatureVerified: true,
      priceId: 'pdt_new',
      providerSubscriptionId: 'sub_123'
    });
  });

  it('rejects Dodo webhook signatures that do not cover the id and timestamp', async () => {
    const rawBody = JSON.stringify({ type: 'subscription.renewed', data: {} });
    const { secret, headers } = standardWebhookHeaders(rawBody);
    headers.set('webhook-id', 'tampered-id');
    const provider = createDodoProvider({
      apiKey: 'test-key',
      webhookSecret: secret
    });

    await expect(provider.parseWebhook?.({ rawBody, headers })).rejects.toMatchObject({
      code: 'BILLFN_WEBHOOK_SIGNATURE_INVALID'
    });
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
