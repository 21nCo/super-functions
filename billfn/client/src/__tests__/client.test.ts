import { describe, expect, it, vi } from 'vitest';
import { createBillFnClient } from '../index.js';

describe('@billfn/client', () => {
  it('calls the expected checkout endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({
        ok: true,
        data: {
          checkoutSession: {
            checkoutSessionId: 'chk_123'
          }
        },
        meta: {
          timestamp: '2026-04-20T00:00:00.000Z'
        }
      }), {
        status: 201,
        headers: {
          'content-type': 'application/json'
        }
      })
    ) as typeof fetch;

    const client = createBillFnClient({
      baseUrl: 'https://billfn.example.test/billfn',
      fetch: fetchMock
    });

    const response = await client.createCheckout({
      subject: { principalId: 'user_123' },
      planKey: 'pro',
      provider: 'dodo',
      interval: 'month'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://billfn.example.test/billfn/checkouts',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(response.ok).toBe(true);
  });
});
