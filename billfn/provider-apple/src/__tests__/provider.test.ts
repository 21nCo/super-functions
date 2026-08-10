import { describe, expect, it, vi } from 'vitest';
import { createAppleProvider } from '../index.js';

function encodePayload(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('@billfn/provider-apple', () => {
  it('maps subscription verification responses to normalized billfn state with prod-to-sandbox fallback', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const value = new URL(String(url));
      if (value.hostname === 'api.storekit.itunes.apple.com') {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              lastTransactions: [
                {
                  signedTransactionInfo: encodePayload({
                    originalTransactionId: 'orig_123',
                    transactionId: 'txn_123',
                    purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z')),
                    expiresDate: String(Date.parse('2026-05-20T00:00:00.000Z')),
                    status: 1
                  }),
                  signedRenewalInfo: encodePayload({
                    autoRenewStatus: 1
                  })
                }
              ]
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    }) as typeof fetch;

    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token'
    });

    const verified = await provider.verifyCheckout?.({
      checkoutSession: {
        checkoutSessionId: 'chk_123',
        billingAccountId: 'ba_user_123',
        planKey: 'pro',
        priceId: 'price_apple',
        provider: 'apple',
        status: 'requires_action',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
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
        priceId: 'price_apple',
        provider: 'apple',
        providerProductId: 'apple.pro.month',
        amount: 12,
        currency: 'USD',
        interval: 'month',
        kind: 'subscription'
      },
      payload: {
        transactionId: 'txn_123'
      }
    });

    expect(verified?.subscriptionStatus).toBe('active');
    expect(verified?.providerChargeId).toBe('txn_123');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/txn_123');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/txn_123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to sandbox when production auth fails', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'expired-token'
    });

    await expect(
      provider.verifyCheckout?.({
        checkoutSession: {
          checkoutSessionId: 'chk_123',
          billingAccountId: 'ba_user_123',
          planKey: 'pro',
          priceId: 'price_apple',
          provider: 'apple',
          status: 'requires_action',
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z'
        },
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
          priceId: 'price_apple',
          provider: 'apple',
          providerProductId: 'apple.pro.month',
          amount: 12,
          currency: 'USD',
          interval: 'month',
          kind: 'subscription'
        },
        payload: {
          transactionId: 'txn_123'
        }
      })
    ).rejects.toMatchObject({
      code: 'BILLFN_PROVIDER_ERROR'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects empty subscription responses instead of marking them active', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token'
    });

    await expect(provider.fetchSubscription?.({
      subscription: {
        id: 'sub_local',
        billingAccountId: 'ba_user_123',
        planKey: 'pro',
        priceId: 'price_apple',
        provider: 'apple',
        providerSubscriptionId: 'orig_123',
        status: 'active',
        autoRenew: true,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }
    })).rejects.toMatchObject({
      code: 'BILLFN_NOT_FOUND'
    });
  });

  it('uses the subscriptions endpoint when restoring Apple subscription purchases', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              lastTransactions: [
                {
                  signedTransactionInfo: encodePayload({
                    originalTransactionId: 'orig_restore',
                    transactionId: 'txn_restore',
                    purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z')),
                    expiresDate: String(Date.parse('2026-05-20T00:00:00.000Z')),
                    status: 1
                  })
                }
              ]
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    ) as typeof fetch;

    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token'
    });

    const restored = await provider.restorePurchases?.({
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
        priceId: 'price_apple',
        provider: 'apple',
        providerProductId: 'apple.pro.month',
        amount: 12,
        currency: 'USD',
        interval: 'month',
        kind: 'subscription'
      },
      purchaseReference: 'orig_restore'
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/inApps/v1/subscriptions/orig_restore');
    expect(restored?.[0]?.subscriptionStatus).toBe('active');
  });

  it('uses the v2 history endpoint for non-subscription purchase restoration', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signedTransactions: [
            encodePayload({
              originalTransactionId: 'orig_lifetime',
              transactionId: 'txn_lifetime',
              purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z'))
            })
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    ) as typeof fetch;

    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token'
    });

    await provider.restorePurchases?.({
      billingAccount: {
        id: 'ba_user_123',
        ownerType: 'user',
        ownerId: 'user_123',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      },
      plan: {
        productKey: 'nucleus',
        planKey: 'lifetime',
        displayName: 'Lifetime',
        features: {},
        limits: {},
        prices: []
      },
      price: {
        priceId: 'price_lifetime',
        provider: 'apple',
        providerProductId: 'apple.lifetime',
        amount: 120,
        currency: 'USD',
        kind: 'one_time',
        interval: 'lifetime'
      },
      purchaseReference: 'txn_lifetime'
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/inApps/v2/history/txn_lifetime');
  });

  it('parses App Store Server Notifications v2 payloads using the configured verifier', async () => {
    const provider = createAppleProvider({
      tokenProvider: async () => 'token',
      notificationVerifier: async () => ({
        notificationUUID: 'notif_123',
        notificationType: 'DID_RENEW',
        data: {
          signedTransactionInfo: encodePayload({
            originalTransactionId: 'orig_123',
            transactionId: 'txn_123',
            purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z')),
            expiresDate: String(Date.parse('2026-05-20T00:00:00.000Z')),
            status: 1
          }),
          signedRenewalInfo: encodePayload({
            autoRenewStatus: 1
          })
        }
      })
    });

    const events = await provider.parseWebhook?.({
      headers: new Headers(),
      rawBody: JSON.stringify({
        signedPayload: 'signed'
      })
    });

    expect(events).toHaveLength(1);
    expect(events?.[0]?.signatureVerified).toBe(true);
    expect(events?.[0]?.billingState?.subscriptionStatus).toBe('active');
  });

  it('returns manage-subscription actions when Advanced Commerce is unavailable', async () => {
    const provider = createAppleProvider({
      tokenProvider: async () => 'token'
    });

    const response = await provider.cancelSubscription?.({
      subscription: {
        id: 'sub_local',
        billingAccountId: 'ba_user_123',
        planKey: 'pro',
        priceId: 'price_apple',
        provider: 'apple',
        providerSubscriptionId: 'orig_123',
        providerChargeId: 'txn_123',
        status: 'active',
        autoRenew: true,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z'
      }
    });

    expect(response?.operationStatus).toBe('requires_action');
    expect(response?.clientAction?.type).toBe('manage-subscription');
  });

  it('fetches notification history and maps events', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          notificationHistory: [
            {
              signedPayload: encodePayload({
                notificationUUID: 'notif_history',
                notificationType: 'EXPIRED',
                data: {
                  signedTransactionInfo: encodePayload({
                    originalTransactionId: 'orig_history',
                    transactionId: 'txn_history',
                    purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z')),
                    expiresDate: String(Date.parse('2026-05-20T00:00:00.000Z')),
                    status: 2
                  })
                }
              })
            }
          ],
          nextPaginationToken: 'cursor_next'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    ) as typeof fetch;

    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token',
      notificationVerifier: async () => ({
        notificationUUID: 'notif_history',
        notificationType: 'EXPIRED',
        data: {
          signedTransactionInfo: encodePayload({
            originalTransactionId: 'orig_history',
            transactionId: 'txn_history',
            purchaseDate: String(Date.parse('2026-04-20T00:00:00.000Z')),
            expiresDate: String(Date.parse('2026-05-20T00:00:00.000Z')),
            status: 2
          })
        }
      })
    });

    const page = await provider.fetchNotificationHistory?.({
      cursor: 'cursor_1',
      limit: 10
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/inApps/v1/notifications/history?paginationToken=cursor_1');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST'
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      startDate: expect.any(Number),
      endDate: expect.any(Number)
    });
    expect(page?.events).toHaveLength(1);
    expect(page?.events[0]?.billingState?.subscriptionStatus).toBe('expired');
    expect(page?.nextCursor).toBe('cursor_next');
  });

  it('fails before fetching notification history when notificationVerifier is missing', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    const provider = createAppleProvider({
      fetch: fetchMock,
      tokenProvider: async () => 'token'
    });

    expect(provider.capabilities.notificationHistory).toBe(false);
    await expect(provider.fetchNotificationHistory?.({ limit: 10 })).rejects.toMatchObject({
      code: 'BILLFN_VALIDATION_ERROR',
      message: expect.stringContaining('notificationVerifier')
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
