import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NoopLogger, ProviderRegistry, WebhookHandler, type Provider } from 'plugfn';
import { slackProvider } from '../src/slack/index.js';
import { stripeProvider } from '../src/stripe/index.js';

const encoder = new TextEncoder();

describe('Slack and Stripe webhook verification', () => {
  it('verifies Slack signatures over the timestamped raw body', async () => {
    const handler = createHandler(slackProvider);
    const listener = vi.fn();
    handler.on('slack', 'message.channels', listener);
    const secret = 'slack-secret';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify({
      type: 'event_callback',
      event: {
        type: 'message',
        channel: 'C123',
        user: 'U123',
        text: 'hello',
        ts: '1712345678.000001',
      },
    });
    const signature = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;

    await expect(
      handler.handleWebhook(
        'slack',
        'message.channels',
        undefined,
        {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).resolves.toMatchObject({ verified: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each(['payment_intent.succeeded', 'customer.created'])(
    'verifies Stripe timestamped signatures for %s',
    async (event) => {
      const handler = createHandler(stripeProvider);
      const secret = 'stripe-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload =
        event === 'payment_intent.succeeded'
          ? {
              type: event,
              data: {
                object: {
                  id: 'pi_1',
                  amount: 1000,
                  currency: 'usd',
                  customer: null,
                  receipt_email: null,
                },
              },
            }
          : {
              type: event,
              data: {
                object: {
                  id: 'cus_1',
                  email: 'customer@example.com',
                  name: null,
                  created: 1712345678,
                },
              },
            };
      const rawBody = JSON.stringify(payload);
      const digest = createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      await expect(
        handler.handleWebhook(
          'stripe',
          event,
          undefined,
          { 'stripe-signature': `t=${timestamp},v1=${digest}` },
          secret,
          { rawBody: encoder.encode(rawBody) }
        )
      ).resolves.toMatchObject({ verified: true });
    }
  );
});

function createHandler(provider: Provider): WebhookHandler {
  const logger = new NoopLogger();
  const registry = new ProviderRegistry(logger);
  registry.register(provider);
  return new WebhookHandler(registry, logger);
}
