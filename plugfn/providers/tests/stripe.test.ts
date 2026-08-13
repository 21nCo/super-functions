import { describe, expect, it, vi } from 'vitest';
import { stripeProvider } from '../src/stripe/index.js';

describe('Stripe provider actions', () => {
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
