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

  it.each([
    {
      provider: slackProvider,
      name: 'slack',
      event: 'message.channels',
      headers: {
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-slack-signature': 'v0=invalid',
      },
    },
    {
      provider: stripeProvider,
      name: 'stripe',
      event: 'customer.created',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=invalid`,
      },
    },
  ])('rejects invalid $name signatures', async ({ provider, name, event, headers }) => {
    const handler = createHandler(provider);
    await expect(
      handler.handleWebhook(name, event, undefined, headers, 'secret', {
        rawBody: encoder.encode('{"type":"event_callback"}'),
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it.each([
    { provider: slackProvider, name: 'slack', event: 'message.channels' },
    { provider: stripeProvider, name: 'stripe', event: 'customer.created' },
  ])('rejects $name verification without raw request bytes', async ({ provider, name, event }) => {
    const handler = createHandler(provider);
    await expect(
      handler.handleWebhook(name, event, {}, {}, 'secret')
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects expired Slack and Stripe signatures', async () => {
    const timestamp = (Math.floor(Date.now() / 1000) - 301).toString();
    const rawBody = '{"type":"event_callback"}';
    const slackSignature = `v0=${createHmac('sha256', 'secret')
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;
    const stripeSignature = createHmac('sha256', 'secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await expect(
      createHandler(slackProvider).handleWebhook(
        'slack',
        'message.channels',
        undefined,
        {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': slackSignature,
        },
        'secret',
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    await expect(
      createHandler(stripeProvider).handleWebhook(
        'stripe',
        'customer.created',
        undefined,
        { 'stripe-signature': `t=${timestamp},v1=${stripeSignature}` },
        'secret',
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects an empty Stripe raw body even when its signature matches', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const digest = createHmac('sha256', 'secret')
      .update(`${timestamp}.`)
      .digest('hex');

    await expect(
      createHandler(stripeProvider).handleWebhook(
        'stripe',
        'customer.created',
        undefined,
        { 'stripe-signature': `t=${timestamp},v1=${digest}` },
        'secret',
        { rawBody: new Uint8Array() }
      )
    ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });
});

function createHandler(provider: Provider): WebhookHandler {
  const logger = new NoopLogger();
  const registry = new ProviderRegistry(logger);
  registry.register(provider);
  return new WebhookHandler(registry, logger);
}
