import { describe, expect, it, vi } from 'vitest';
import { FetchHttpClient, MemoryAdapter, plugFn } from 'plugfn';
import { stripeProvider } from '../src/stripe/index.js';

describe('Stripe provider actions', () => {
  it('retries a bundled read action without per-call retry options', async () => {
    vi.useFakeTimers();
    try {
      const get = vi
        .spyOn(FetchHttpClient.prototype, 'get')
        .mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { status: 500 }))
        .mockResolvedValueOnce({
          data: { data: [], has_more: false },
          status: 200,
          statusText: 'OK',
          headers: {},
        });
      const plug = plugFn({
        database: new MemoryAdapter(),
        auth: {
          async authenticate() {
            return { userId: 'user-1' };
          },
        },
        baseUrl: 'https://app.example.com',
        encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        integrations: { stripe: { type: 'api-key', apiKey: 'sk_test' } },
      });
      plug.use(stripeProvider);

      const result = plug.stripe['customers.list']({ userId: 'user-1', params: {} });
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(result).resolves.toEqual({ data: [], has_more: false });
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('encodes customer metadata using Stripe form field syntax', async () => {
    const post = vi.fn(async () => ({
      data: {
        id: 'cus_1',
        email: 'user@example.com',
        name: null,
        created: 1,
      },
    }));

    await stripeProvider.actions['customers.create'].execute(
      {
        email: 'user@example.com',
        metadata: { workspace: 'acme', source: 'plugfn' },
      },
      {
        provider: { name: 'stripe', baseUrl: stripeProvider.baseUrl },
        http: { post },
      } as any
    );

    const body = post.mock.calls[0]?.[1] as string;
    const form = new URLSearchParams(body);
    expect(form.get('metadata[workspace]')).toBe('acme');
    expect(form.get('metadata[source]')).toBe('plugfn');
  });
});
