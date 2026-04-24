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
      const value = String(url);
      if (value.includes('api.storekit.apple.com')) {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      tokenProvider: async () => 'token'
    });

    const page = await provider.fetchNotificationHistory?.({
      cursor: 'cursor_1',
      limit: 10
    });

    expect(page?.events).toHaveLength(1);
    expect(page?.events[0]?.billingState?.subscriptionStatus).toBe('expired');
    expect(page?.nextCursor).toBe('cursor_next');
  });
});
