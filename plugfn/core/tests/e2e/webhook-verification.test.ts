import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlugFnRouter } from '../../src/router/http-router.js';
import { plugFn } from '../../src/core/plug-fn.js';
import { githubProvider } from '../../../providers/src/github/index.js';
import { MemoryAdapter } from '../../src/storage/adapters/memory.js';

describe('PlugFn webhook verification e2e', () => {
  it('verifies a signed webhook through the router using raw request bytes', async () => {
    const plug = createPlug();
    const handler = vi.fn();
    plug.providers.register(githubProvider);
    plug.webhooks.on('github', 'issues.opened', handler);

    const router = createPlugFnRouter(plug, {
      webhookSecret: {
        github: 'whsec_github',
      },
    });
    const rawBody =
      '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';

    const response = await router.handle(
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_1',
          'x-hub-signature-256': signRawBody(rawBody, 'whsec_github'),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        event: {
          provider: string;
          event: string;
          verified: boolean;
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.event.provider).toBe('github');
    expect(payload.data.event.event).toBe('issues.opened');
    expect(payload.data.event.verified).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]?.verified).toBe(true);

    const receipt = await plug.runtime.webhooks.findReceiptByIdempotencyKey(
      'github',
      'delivery_1'
    );
    expect(receipt?.verificationStatus).toBe('verified');
  });

  it('resolves canonical GitHub webhook routes to action-specific triggers', async () => {
    const plug = createPlug();
    const handler = vi.fn();
    plug.providers.register(githubProvider);
    plug.webhooks.on('github', 'pull_request.closed', handler);

    const router = createPlugFnRouter(plug, {
      webhookSecret: { github: 'whsec_github' },
    });
    const rawBody = JSON.stringify({
      action: 'closed',
      pull_request: {
        id: 9,
        number: 42,
        title: 'PR title',
        html_url: 'https://example.test/pulls/42',
        merged: true,
      },
      repository: {
        name: 'repo',
        owner: { login: 'octo' },
      },
    });

    const response = await router.handle(
      new Request('http://localhost/webhooks/github', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_action_specific',
          'x-github-event': 'pull_request',
          'x-hub-signature-256': signRawBody(rawBody, 'whsec_github'),
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { event: { event: string } };
    };
    expect(payload.data.event.event).toBe('pull_request.closed');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects a signature when the signed bytes and transmitted bytes differ', async () => {
    const plug = createPlug();
    plug.providers.register(githubProvider);

    const router = createPlugFnRouter(plug, {
      webhookSecret: {
        github: 'whsec_github',
      },
    });
    const signedBody =
      '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';
    const transmittedBody =
      '{"repository":{"owner":{"login":"octo"},"name":"repo"},"issue":{"user":{"login":"octo"},"html_url":"https://example.test/issues/10","body":null,"title":"Bug","number":10,"id":1},"action":"opened"}';

    const response = await router.handle(
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_bad',
          'x-hub-signature-256': signRawBody(signedBody, 'whsec_github'),
        },
        body: transmittedBody,
      })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      ok: boolean;
      error: {
        code: string;
      };
    };

    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');

    const receipt = await plug.runtime.webhooks.findReceiptByIdempotencyKey(
      'github',
      'delivery_bad'
    );
    expect(receipt?.verificationStatus).toBe('failed');
  });

  it('retries a previously failed delivery with the same idempotency key', async () => {
    const plug = createPlug();
    const handler = vi.fn();
    plug.providers.register(githubProvider);
    plug.webhooks.on('github', 'issues.opened', handler);
    const router = createPlugFnRouter(plug, {
      webhookSecret: { github: 'whsec_github' },
    });
    const rawBody =
      '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';
    const createRequest = (signature: string) =>
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_retry_failed',
          'x-hub-signature-256': signature,
        },
        body: rawBody,
      });

    const failed = await router.handle(createRequest('sha256=invalid'));
    const retried = await router.handle(
      createRequest(signRawBody(rawBody, 'whsec_github'))
    );

    expect(failed.status).toBe(400);
    expect(retried.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(retried.json()).resolves.toMatchObject({
      data: { event: { verified: true } },
    });
  });

  it('rejects idempotency key reuse when the payload hash changes', async () => {
    const plug = createPlug();
    const handler = vi.fn();
    plug.providers.register(githubProvider);
    plug.webhooks.on('github', 'issues.opened', handler);

    const router = createPlugFnRouter(plug, {
      webhookSecret: {
        github: 'whsec_github',
      },
    });
    const firstBody =
      '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';
    const secondBody =
      '{"action":"opened","issue":{"id":2,"number":11,"title":"Different","body":null,"html_url":"https://example.test/issues/11","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';

    const firstResponse = await router.handle(
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_same',
          'x-hub-signature-256': signRawBody(firstBody, 'whsec_github'),
        },
        body: firstBody,
      })
    );

    const secondResponse = await router.handle(
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_same',
          'x-hub-signature-256': signRawBody(secondBody, 'whsec_github'),
        },
        body: secondBody,
      })
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(409);
    const payload = (await secondResponse.json()) as {
      ok: boolean;
      error: {
        code: string;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('WEBHOOK_IDEMPOTENCY_CONFLICT');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches concurrent duplicate deliveries only once', async () => {
    const plug = createPlug();
    const handler = vi.fn();
    plug.providers.register(githubProvider);
    plug.webhooks.on('github', 'issues.opened', handler);
    const router = createPlugFnRouter(plug, {
      webhookSecret: { github: 'whsec_github' },
    });
    const rawBody =
      '{"action":"opened","issue":{"id":1,"number":10,"title":"Bug","body":null,"html_url":"https://example.test/issues/10","user":{"login":"octo"}},"repository":{"name":"repo","owner":{"login":"octo"}}}';
    const createRequest = () =>
      new Request('http://localhost/webhooks/github/issues.opened', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery_concurrent',
          'x-hub-signature-256': signRawBody(rawBody, 'whsec_github'),
        },
        body: rawBody,
      });

    const responses = await Promise.all([
      router.handle(createRequest()),
      router.handle(createRequest()),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json())) as Array<{
      data: { duplicate?: boolean };
    }>;

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(payloads.filter((payload) => payload.data.duplicate === true)).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

function createPlug() {
  return plugFn({
    database: new MemoryAdapter(),
    auth: {
      async authenticate() {
        return {
          userId: 'user_e2e',
        };
      },
    },
    baseUrl: 'https://app.example.com',
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    integrations: {
      github: {
        type: 'oauth2',
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
        redirectUris: ['https://app.example.com/oauth/callback'],
        webhookSecret: 'whsec_github',
      },
    },
  });
}

function signRawBody(rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}
