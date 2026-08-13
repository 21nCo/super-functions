import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ProviderRegistry } from '../src/core/provider-registry.js';
import { WebhookHandler } from '../src/webhooks/webhook-handler.js';
import { NoopLogger } from '../src/utils/logger.js';
import { TriggerType } from '../src/types/trigger.js';
import { AuthType } from '../src/types/provider.js';

describe('Webhook verification and mapping', () => {
  it('accepts valid signatures and processes event ids exactly once', async () => {
    const { webhookHandler } = createWebhookHarness();
    const handler = vi.fn();
    webhookHandler.on('gmail', 'mail.update', handler);

    const payload = { id: 'evt_1', message: 'hello' };
    const headers = { 'x-signature': 'sig:secret' };

    const first = await webhookHandler.handleWebhook('gmail', 'mail.update', payload, headers, 'secret');
    const second = await webhookHandler.handleWebhook('gmail', 'mail.update', payload, headers, 'secret');

    expect(first.verified).toBe(true);
    expect(second.verified).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fails closed when signature secret is missing', async () => {
    const { webhookHandler } = createWebhookHarness();

    await expect(
      webhookHandler.handleWebhook(
        'gmail',
        'mail.update',
        { id: 'evt_2' },
        { 'x-signature': 'sig:secret' }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SECRET_NOT_FOUND',
    });
  });

  it('rejects invalid signatures with WEBHOOK_SIGNATURE_INVALID', async () => {
    const { webhookHandler } = createWebhookHarness();

    await expect(
      webhookHandler.handleWebhook(
        'gmail',
        'mail.update',
        { id: 'evt_3' },
        { 'x-signature': 'bad' },
        'secret'
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
  });

  it('maps path-style webhook events to canonical trigger keys', async () => {
    const { webhookHandler } = createWebhookHarness();
    const handler = vi.fn();
    webhookHandler.on('gmail', 'mail.update', handler);

    await webhookHandler.handleWebhook(
      'gmail',
      'mail/update',
      { id: 'evt_4' },
      { 'x-signature': 'sig:secret' },
      'secret'
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('maps declared webhook route suffixes to canonical trigger keys', async () => {
    const { webhookHandler } = createWebhookHarness();
    const handler = vi.fn();
    webhookHandler.on('gmail', 'mail.update', handler);

    await webhookHandler.handleWebhook(
      'gmail',
      'mail-update',
      { id: 'evt_declared_path' },
      { 'x-signature': 'sig:secret' },
      'secret'
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('normalizes repeated leading and trailing path separators without regex backtracking', async () => {
    const { webhookHandler } = createWebhookHarness();
    const handler = vi.fn();
    webhookHandler.on('gmail', 'mail.update', handler);

    await webhookHandler.handleWebhook(
      'gmail',
      `${'/'.repeat(10000)}mail/update${'/'.repeat(10000)}`,
      { id: 'evt_many_separators' },
      { 'x-signature': 'sig:secret' },
      'secret'
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns deterministic validation error for unknown events', async () => {
    const { webhookHandler } = createWebhookHarness();

    await expect(
      webhookHandler.handleWebhook(
        'gmail',
        'not-real',
        { id: 'evt_5' },
        { 'x-signature': 'sig:secret' },
        'secret'
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('propagates downstream handler failures so provider delivery can retry', async () => {
    const { webhookHandler } = createWebhookHarness();
    webhookHandler.on('gmail', 'mail.update', async () => {
      throw new Error('database unavailable');
    });

    await expect(
      webhookHandler.handleWebhook(
        'gmail',
        'mail.update',
        { id: 'evt_failed_handler' },
        { 'x-signature': 'sig:secret' },
        'secret'
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_HANDLER_FAILED',
      message: 'webhook handler failed',
      status: 503,
      details: {},
    });
  });
});

function createWebhookHarness() {
  const logger = new NoopLogger();
  const providerRegistry = new ProviderRegistry(logger);

  providerRegistry.register({
    name: 'gmail',
    displayName: 'Gmail',
    version: '1.0.0',
    description: 'Gmail provider',
    baseUrl: 'https://gmail.googleapis.com',
    auth: {
      type: AuthType.ApiKey,
      config: {},
    },
    actions: {},
    triggers: {
      'mail.update': {
        name: 'mail.update',
        displayName: 'Mail Update',
        description: 'Mail update trigger',
        type: TriggerType.Webhook,
        schema: z.any(),
        webhookConfig: {
          path: '/webhooks/gmail/mail-update',
          method: 'POST',
          verifySignature: async (_payload, signature, secret) => {
            return signature === `sig:${secret}`;
          },
        },
        handler: async (payload: any) => {
          return {
            event: 'mail.update',
            data: payload,
          };
        },
      },
    },
  });

  return {
    webhookHandler: new WebhookHandler(providerRegistry, logger),
  };
}
