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
    {
      provider: 'gmail',
      event: 'mail.update',
      header: 'x-goog-signature-256',
      secret: 'gmail-secret',
      rawBody: '{"message":{"data":"eyJoaXN0b3J5SWQiOiIxMjMifQ=="}}',
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
    {
      provider: 'gmail',
      event: 'mail.update',
      header: 'x-goog-signature-256',
      secret: 'gmail-secret',
      originalRawBody: '{"message":{"data":"eyJoaXN0b3J5SWQiOiIxMjMifQ=="}}',
      alteredRawBody: '{"message":{"data":"eyJoaXN0b3J5SWQiOiIxMjMifQ=="}, "historyId":"123"}',
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
      get: vi.fn(() => undefined),
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
