import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from 'plugfn';
import { linearProvider } from '../../src/linear/index.js';
import { WebhookHandler } from 'plugfn';
import { NoopLogger } from 'plugfn';

const encoder = new TextEncoder();

function sign(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

describe('linear webhook verification', () => {
  it('emits issue.updated only for signed payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(linearProvider);

    const webhookHandler = new WebhookHandler(registry, logger);
    const handler = vi.fn();
    webhookHandler.on('linear', 'issue.updated', handler);

    const payload = {
      action: 'update',
      data: {
        id: 'issue_1',
        identifier: 'ENG-1234',
        title: 'Updated title',
      },
    };
    const secret = 'linear-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await webhookHandler.handleWebhook(
      'linear',
      'issue.updated',
      undefined,
      { 'x-signature': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );

    expect(accepted.verified).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(
      webhookHandler.handleWebhook(
        'linear',
        'issue.updated',
        undefined,
        { 'x-signature': 'bad' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits issue_comment.created only for signed payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(linearProvider);

    const webhookHandler = new WebhookHandler(registry, logger);
    const handler = vi.fn();
    webhookHandler.on('linear', 'issue_comment.created', handler);

    const payload = {
      action: 'create',
      data: {
        id: 'comment_1',
        body: '/conduct spec',
        issue: {
          id: 'issue_1',
          identifier: 'ENG-1234',
        },
      },
    };
    const secret = 'linear-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await webhookHandler.handleWebhook(
      'linear',
      'issue_comment.created',
      undefined,
      { 'x-signature': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );

    expect(accepted.verified).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(
      webhookHandler.handleWebhook(
        'linear',
        'issue_comment.created',
        undefined,
        { 'x-signature': 'sha256=invalid' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
