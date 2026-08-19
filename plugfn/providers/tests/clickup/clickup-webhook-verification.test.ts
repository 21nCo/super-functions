import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from 'plugfn';
import { clickupProvider } from '../../src/clickup/index.js';
import { NoopLogger } from 'plugfn';
import { WebhookHandler } from 'plugfn';

const encoder = new TextEncoder();

function sign(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

describe('clickup webhook verification', () => {
  it('emits task.updated only for verified payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(clickupProvider);
    const handler = new WebhookHandler(registry, logger);

    const listener = vi.fn();
    handler.on('clickup', 'task.updated', listener);

    const payload = {
      event: 'taskUpdated',
      task_id: 'task_1',
    };
    const secret = 'clickup-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await handler.handleWebhook(
      'clickup',
      'task.updated',
      undefined,
      { 'x-signature': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );
    expect(accepted.verified).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    await expect(
      handler.handleWebhook(
        'clickup',
        'task.updated',
        undefined,
        { 'x-signature': 'sha256=bad' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits task.statusChanged only for verified payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(clickupProvider);
    const handler = new WebhookHandler(registry, logger);

    const listener = vi.fn();
    handler.on('clickup', 'task.statusChanged', listener);

    const payload = {
      event: 'taskStatusUpdated',
      task_id: 'task_1',
      status: 'done',
    };
    const secret = 'clickup-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await handler.handleWebhook(
      'clickup',
      'task.statusChanged',
      undefined,
      { 'x-signature': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );
    expect(accepted.verified).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    await expect(
      handler.handleWebhook(
        'clickup',
        'task.statusChanged',
        undefined,
        { 'x-signature': 'sha256=invalid' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
