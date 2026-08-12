import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlugFnRouter } from '../src/router/http-router.js';
import { ProviderRegistry } from '../src/core/provider-registry.js';
import { githubProvider } from '../../providers/src/github/index.js';
import { linearProvider } from '../../providers/src/linear/index.js';
import { clickupProvider } from '../../providers/src/clickup/index.js';
import { gmailProvider } from '../../providers/src/gmail/index.js';
import { WebhookHandler } from '../src/webhooks/webhook-handler.js';
import { NoopLogger } from '../src/utils/logger.js';

const encoder = new TextEncoder();

describe('raw-body webhook verification', () => {
  it('passes raw bytes from the router to webhook handling before verification', async () => {
    const handleWebhook = vi.fn(async () => ({ id: 'evt_1', verified: true }));
    const router = createPlugFnRouter(createRouterPlugMock(handleWebhook), {
      webhookSecret: {
        github: 'router-secret',
      },
    });
    const rawBody = '{\n  "action":"opened",\n  "issue":{"id":1}\n}';

    const response = await router.handle(
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signRawBody(rawBody, 'router-secret'),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledTimes(1);
    expect(handleWebhook.mock.calls[0]?.[0]).toBe('github');
    expect(handleWebhook.mock.calls[0]?.[1]).toBe('issues.opened');
    expect(handleWebhook.mock.calls[0]?.[2]).toBeUndefined();
    expect(decodeBytes(handleWebhook.mock.calls[0]?.[5]?.rawBody)).toBe(rawBody);
  });

  it('falls back to a registered GitHub family trigger for unknown actions', async () => {
    const handleWebhook = vi.fn(async () => ({ id: 'evt_family', verified: true }));
    const router = createPlugFnRouter(createRouterPlugMock(handleWebhook), {
      webhookSecret: { github: 'router-secret' },
    });
    const rawBody = '{"action":"transferred","issue":{"id":1}}';

    const response = await router.handle(
      new Request('http://localhost/webhooks/github', {
        method: 'POST',
        headers: {
          'x-github-event': 'issues',
          'x-hub-signature-256': signRawBody(rawBody, 'router-secret'),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledWith(
      'github',
      'issues',
      undefined,
      expect.any(Object),
      'router-secret',
      expect.any(Object)
    );
  });

  it('infers Gmail Pub/Sub envelopes as the registered mail.update trigger', async () => {
    const handleWebhook = vi.fn(async () => ({ id: 'evt_gmail', verified: true }));
    const router = createPlugFnRouter(createRouterPlugMock(handleWebhook), {
      webhookSecret: { gmail: 'gmail-verification-config' },
    });
    const rawBody = JSON.stringify({
      message: {
        data: 'eyJlbWFpbEFkZHJlc3MiOiJ1c2VyQGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoiMTIzIn0=',
        messageId: 'pubsub-1',
      },
      subscription: 'projects/demo/subscriptions/gmail',
    });

    const response = await router.handle(
      new Request('http://localhost/webhooks/gmail', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledWith(
      'gmail',
      'mail.update',
      undefined,
      expect.any(Object),
      'gmail-verification-config',
      expect.any(Object)
    );
  });

  it('does not dispatch when another request already claimed the delivery key', async () => {
    const handleWebhook = vi.fn(async () => ({ id: 'evt_duplicate', verified: true }));
    const plug = createRouterPlugMock(handleWebhook);
    plug.runtime.webhooks.createReceipt = vi.fn(async () => ({
      id: 'receipt_existing',
      metadata: { receiptClaimToken: 'claim_from_other_request' },
    }));
    const router = createPlugFnRouter(plug, {
      webhookSecret: { github: 'router-secret' },
    });
    const rawBody = '{"action":"opened","issue":{"id":1}}';

    const response = await router.handle(
      new Request('http://localhost/webhooks/github/issues', {
        method: 'POST',
        headers: {
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signRawBody(rawBody, 'router-secret'),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { duplicate: true, receiptId: 'receipt_existing' },
    });
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it.each([
    {
      provider: 'github',
      event: 'issues.opened',
      header: 'x-hub-signature-256',
      secret: 'github-secret',
      rawBody:
        '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}',
    },
    {
      provider: 'linear',
      event: 'issue.updated',
      header: 'x-linear-signature',
      secret: 'linear-secret',
      rawBody: '{"action":"update","data":{"id":"issue_1","identifier":"ENG-1","title":"Updated title"}}',
    },
    {
      provider: 'clickup',
      event: 'task.updated',
      header: 'x-signature',
      secret: 'clickup-secret',
      rawBody: '{"event":"taskUpdated","task_id":"task_1"}',
    },
  ])(
    'verifies $provider signatures against raw bytes',
    async ({ provider, event, header, secret, rawBody }) => {
      const webhookHandler = createWebhookHandler();

      const accepted = await webhookHandler.handleWebhook(
        provider,
        event,
        undefined,
        { [header]: signRawBody(rawBody, secret) },
        secret,
        { rawBody: encoder.encode(rawBody) }
      );

      expect(accepted.verified).toBe(true);
    }
  );

  it.each([
    {
      provider: 'github',
      event: 'issues.opened',
      header: 'x-hub-signature-256',
      secret: 'github-secret',
      originalRawBody:
        '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}',
      alteredRawBody:
        '{"repository":{"owner":{"login":"octo"},"name":"repo"},"issue":{"user":{"login":"octo"},"html_url":"https://example.test/issues/10","body":null,"title":"Bug","number":10,"id":1},"action":"opened"}',
    },
    {
      provider: 'linear',
      event: 'issue.updated',
      header: 'x-linear-signature',
      secret: 'linear-secret',
      originalRawBody: '{"action":"update","data":{"id":"issue_1","identifier":"ENG-1","title":"Updated title"}}',
      alteredRawBody: '{"data":{"title":"Updated title","identifier":"ENG-1","id":"issue_1"},"action":"update"}',
    },
    {
      provider: 'clickup',
      event: 'task.updated',
      header: 'x-signature',
      secret: 'clickup-secret',
      originalRawBody: '{"event":"taskUpdated","task_id":"task_1"}',
      alteredRawBody: '{"task_id":"task_1","event":"taskUpdated"}',
    },
  ])(
    'rejects $provider when parsed JSON matches but raw bytes differ',
    async ({ provider, event, header, secret, originalRawBody, alteredRawBody }) => {
      const webhookHandler = createWebhookHandler();

      await expect(
        webhookHandler.handleWebhook(
          provider,
          event,
          undefined,
          { [header]: signRawBody(originalRawBody, secret) },
          secret,
          { rawBody: encoder.encode(alteredRawBody) }
        )
      ).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
    }
  );

  it('rejects signed payloads that do not satisfy the trigger schema', async () => {
    const webhookHandler = createWebhookHandler();
    const rawBody = '{"action":"opened","issue":{"id":1}}';

    await expect(
      webhookHandler.handleWebhook(
        'github',
        'issues.opened',
        undefined,
        { 'x-hub-signature-256': signRawBody(rawBody, 'github-secret') },
        'github-secret',
        { rawBody: encoder.encode(rawBody) }
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'webhook payload validation failed',
    });
  });

  it('retains provider payload fields not named by the validation schema', async () => {
    const webhookHandler = createWebhookHandler();
    const rawBody = JSON.stringify({
      action: 'opened',
      issue: {
        id: 1,
        number: 10,
        title: 'Bug',
        body: null,
        html_url: 'https://example.test/issues/10',
        user: { login: 'octo' },
      },
      repository: { name: 'repo', owner: { login: 'octo' } },
      sender: { login: 'webhook-sender' },
    });

    const event = await webhookHandler.handleWebhook(
      'github',
      'issues.opened',
      undefined,
      { 'x-hub-signature-256': signRawBody(rawBody, 'github-secret') },
      'github-secret',
      { rawBody: encoder.encode(rawBody) }
    );

    expect(event.payload.sender).toEqual({ login: 'webhook-sender' });
  });
});

function createWebhookHandler(): WebhookHandler {
  const logger = new NoopLogger();
  const registry = new ProviderRegistry(logger);
  registry.register(githubProvider);
  registry.register(linearProvider);
  registry.register(clickupProvider);
  registry.register(gmailProvider);
  return new WebhookHandler(registry, logger);
}

function createRouterPlugMock(handleWebhook: ReturnType<typeof vi.fn>) {
  return {
    config: {
      auth: {
        authenticate: vi.fn(async () => ({ userId: 'router-user' })),
      },
      baseUrl: 'https://app.example.com',
      integrations: {},
    },
    connections: {
      start: vi.fn(async () => ({ authUrl: 'https://example.test/auth' })),
      getAuthUrl: vi.fn(async () => 'https://example.test/auth'),
      handleCallback: vi.fn(async () => ({ id: 'conn_1', provider: 'github', status: 'active' })),
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({ id: 'conn_1' })),
      disconnect: vi.fn(async () => undefined),
      refresh: vi.fn(async () => ({ id: 'conn_1' })),
    },
    workflows: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      getStats: vi.fn(async () => ({})),
    },
    webhooks: {
      on: vi.fn(),
      off: vi.fn(),
      verify: vi.fn(async () => ({ verified: true })),
      handle: handleWebhook,
    },
    runtime: {
      webhooks: {
        createReceipt: vi.fn(async () => ({ id: 'receipt_1' })),
        getReceipt: vi.fn(async () => null),
        findReceiptByIdempotencyKey: vi.fn(async () => null),
        updateReceipt: vi.fn(async () => ({ id: 'receipt_1' })),
        createDelivery: vi.fn(async () => ({ id: 'delivery_1', attempts: 0 })),
        updateDelivery: vi.fn(async () => ({ id: 'delivery_1', attempts: 1 })),
        listDeliveries: vi.fn(async () => []),
        processDueDeliveries: vi.fn(async () => ({
          processed: 0,
          succeeded: 0,
          failed: 0,
          deadLettered: 0,
          deliveries: [],
        })),
      },
    },
    providers: {
      list: vi.fn(() => []),
      get: vi.fn((provider: string) => {
        if (provider === 'github') return githubProvider;
        if (provider === 'gmail') return gmailProvider;
        return undefined;
      }),
      register: vi.fn(),
    },
    batch: vi.fn(async () => []),
    getMetrics: vi.fn(async () => ({})),
    on: vi.fn(),
    off: vi.fn(),
  } as any;
}

function signRawBody(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

function decodeBytes(value: Uint8Array | undefined): string {
  return value ? new TextDecoder().decode(value) : '';
}
