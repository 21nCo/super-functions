import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from 'plugfn';
import { githubProvider } from '../../src/github/index.js';
import { WebhookHandler } from 'plugfn';
import { NoopLogger } from 'plugfn';

const encoder = new TextEncoder();

function sign(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

describe('github webhook verification', () => {
  it('emits pull_request.closed only for verified payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(githubProvider);

    const handler = new WebhookHandler(registry, logger);
    const listener = vi.fn();
    handler.on('github', 'pull_request.closed', listener);

    const payload = {
      action: 'closed',
      pull_request: {
        id: 9,
        number: 42,
        title: 'PR title',
        html_url: 'https://github.com/21nCo/super-functions/pull/42',
        merged: true,
      },
      repository: {
        name: 'super-functions',
        owner: {
          login: '21nCo',
        },
      },
    };
    const secret = 'github-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await handler.handleWebhook(
      'github',
      'pull_request.closed',
      undefined,
      { 'x-hub-signature-256': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );
    expect(accepted.verified).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    await expect(
      handler.handleWebhook(
        'github',
        'pull_request.closed',
        undefined,
        { 'x-hub-signature-256': 'sha256=bad' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits issue_comment.created only for verified payloads', async () => {
    const logger = new NoopLogger();
    const registry = new ProviderRegistry(logger);
    registry.register(githubProvider);

    const handler = new WebhookHandler(registry, logger);
    const listener = vi.fn();
    handler.on('github', 'issue_comment.created', listener);

    const payload = {
      action: 'created',
      issue: {
        id: 5,
        number: 42,
        title: 'Issue title',
        html_url: 'https://github.com/21nCo/super-functions/issues/42',
      },
      comment: {
        id: 10,
        body: '/conduct spec',
      },
      repository: {
        name: 'super-functions',
        owner: {
          login: '21nCo',
        },
      },
    };
    const secret = 'github-secret';
    const rawBody = JSON.stringify(payload);

    const accepted = await handler.handleWebhook(
      'github',
      'issue_comment.created',
      undefined,
      { 'x-hub-signature-256': sign(rawBody, secret) },
      secret,
      { rawBody: encoder.encode(rawBody) }
    );
    expect(accepted.verified).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    await expect(
      handler.handleWebhook(
        'github',
        'issue_comment.created',
        undefined,
        { 'x-hub-signature-256': 'sha256=invalid' },
        secret,
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
