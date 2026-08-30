import { describe, expect, it, vi } from 'vitest';

import type { MailFnEvent, Webhook } from '@mailfn/core';
import {
  CloudflareWebhookDispatcher,
  MemoryWebhookReplayStore,
  verifyMailFnWebhook,
  verifyMailFnWebhookOnce,
} from './webhook.js';

const resolvePublic = async () => ['93.184.216.34'];
const resolvedFetch = (fetcher: typeof globalThis.fetch) => async (url: URL, addresses: readonly string[], init: RequestInit) => {
  expect(addresses).toEqual(['93.184.216.34']);
  return fetcher(url, init);
};

describe('Cloudflare webhook delivery', () => {
  it('signs timestamped delivery payloads and permits replay checks', async () => {
    let captured: { body: string; headers: Headers } | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = { body: String(init?.body), headers: new Headers(init?.headers) };
      return new Response(null, { status: 204 });
    });
    const webhook = {
      id: 'whk_1', projectId: 'prj_1', url: 'https://hooks.example.test/mailfn', eventTypes: ['message.parsed'],
      secretHash: 'hash', secretCiphertext: 'top-secret', status: 'active', consecutiveFailures: 0,
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    } satisfies Webhook;
    const event = {
      id: 'evt_1', version: 1, type: 'message.parsed', projectId: 'prj_1', occurredAt: '2026-08-10T00:00:00.000Z', payload: {},
    } satisfies MailFnEvent;
    const timestamp = '2026-08-10T00:00:00.000Z';
    const result = await new CloudflareWebhookDispatcher({ fetchResolved: resolvedFetch(fetcher), resolveHostname: resolvePublic })
      .deliver({ webhook, event, deliveryId: 'delivery-1', timestamp });
    expect(result).toEqual({ ok: true, status: 204, retryable: false });
    expect(await verifyMailFnWebhook({
      body: captured!.body,
      secret: 'top-secret',
      deliveryId: 'delivery-1',
      timestamp,
      signature: captured!.headers.get('MailFn-Signature')!,
      now: new Date(timestamp),
    })).toBe(true);
    expect(await verifyMailFnWebhook({
      body: captured!.body,
      secret: 'top-secret',
      deliveryId: 'delivery-1',
      timestamp,
      signature: captured!.headers.get('MailFn-Signature')!,
      now: new Date('2026-08-10T00:10:00.000Z'),
    })).toBe(false);
  });

  it('retries transient failures but not permanent consumer errors', async () => {
    const transient = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const input = {
      webhook: {
        id: 'w', projectId: 'p', url: 'https://example.test', eventTypes: ['message.received'], secretHash: 'h',
        secretCiphertext: 's', status: 'active', consecutiveFailures: 0, createdAt: '', updatedAt: '',
      } as Webhook,
      event: { id: 'e', version: 1, type: 'message.received', projectId: 'p', occurredAt: '', payload: {} } as MailFnEvent,
      deliveryId: 'd', timestamp: new Date().toISOString(),
    };
    await expect(new CloudflareWebhookDispatcher({ fetchResolved: resolvedFetch(transient), maxAttempts: 2, resolveHostname: resolvePublic }).deliver(input))
      .resolves.toMatchObject({ ok: true });
    expect(transient).toHaveBeenCalledTimes(2);
    const timeout = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 408 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new CloudflareWebhookDispatcher({ fetchResolved: resolvedFetch(timeout), maxAttempts: 2, resolveHostname: resolvePublic }).deliver(input))
      .resolves.toMatchObject({ ok: true });
    expect(timeout).toHaveBeenCalledTimes(2);
    const permanent = vi.fn(async () => new Response(null, { status: 400 }));
    await expect(new CloudflareWebhookDispatcher({ fetchResolved: resolvedFetch(permanent), resolveHostname: resolvePublic }).deliver(input))
      .resolves.toEqual({ ok: false, status: 400, retryable: false });
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid signed delivery when its durable replay key was already consumed', async () => {
    const now = new Date();
    const timestamp = now.toISOString();
    const body = '{"event":"message.received"}';
    const webhook = {
      id: 'w', projectId: 'p', url: 'https://example.com', eventTypes: ['message.received'], secretHash: 'h',
      secretCiphertext: 'secret', status: 'active', consecutiveFailures: 0, createdAt: timestamp, updatedAt: timestamp,
    } as Webhook;
    let signature = '';
    const dispatcher = new CloudflareWebhookDispatcher({
      resolveHostname: resolvePublic,
      fetchResolved: async (_url, _addresses, init) => {
        signature = new Headers(init?.headers).get('MailFn-Signature') ?? '';
        return new Response(null, { status: 204 });
      },
    });
    await dispatcher.deliver({
      webhook,
      event: JSON.parse(body) as MailFnEvent,
      deliveryId: 'delivery-replay',
      timestamp,
    });
    const signedBody = JSON.stringify(JSON.parse(body));
    const replayStore = new MemoryWebhookReplayStore();
    const verification = { body: signedBody, secret: 'secret', deliveryId: 'delivery-replay', timestamp, signature, now, replayStore };
    await expect(verifyMailFnWebhookOnce(verification)).resolves.toBe(true);
    await expect(verifyMailFnWebhookOnce(verification)).resolves.toBe(false);
  });

  it('blocks webhook delivery when DNS resolves to a private address', async () => {
    const fetcher = vi.fn();
    const dispatcher = new CloudflareWebhookDispatcher({ fetchResolved: resolvedFetch(fetcher), resolveHostname: async () => ['127.0.0.1'] });
    const now = new Date().toISOString();
    const result = await dispatcher.deliver({
      webhook: {
        id: 'w', projectId: 'p', url: 'https://example.com', eventTypes: ['message.received'], secretHash: 'h',
        secretCiphertext: 'secret', status: 'active', consecutiveFailures: 0, createdAt: now, updatedAt: now,
      } as Webhook,
      event: { id: 'e', version: 1, type: 'message.received', projectId: 'p', occurredAt: now, payload: {} },
      deliveryId: 'd',
      timestamp: now,
    });
    expect(result).toEqual({ ok: false, retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects alternate private IPv6 spellings during URL validation', async () => {
    for (const address of ['::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) {
      const dispatcher = new CloudflareWebhookDispatcher({ resolveHostname: async () => [address] });
      await expect(dispatcher.validateUrl(new URL('https://example.com/hook'))).rejects.toThrow(
        'Webhook host must resolve only to public IP addresses',
      );
    }
  });

  it('rejects the IANA 6a44 relay address as non-global', async () => {
    const dispatcher = new CloudflareWebhookDispatcher({ resolveHostname: async () => ['192.88.99.2'] });
    await expect(dispatcher.validateUrl(new URL('https://example.com/hook'))).rejects.toThrow(
      'Webhook host must resolve only to public IP addresses',
    );
  });

  it('rejects Cloudflare address ranges that the pinned socket transport cannot connect to', async () => {
    for (const address of ['104.16.0.1', '2606:4700::1']) {
      const dispatcher = new CloudflareWebhookDispatcher({ resolveHostname: async () => [address] });
      await expect(dispatcher.validateUrl(new URL('https://example.com/hook'))).rejects.toThrow(
        'Cloudflare-proxied webhook hosts are unsupported',
      );
    }
    await expect(new CloudflareWebhookDispatcher({ resolveHostname: resolvePublic })
      .validateUrl(new URL('https://example.com/hook'))).resolves.toBeUndefined();
  });

  it('fails closed when no DNS-pinning transport is configured', async () => {
    const now = new Date().toISOString();
    const result = await new CloudflareWebhookDispatcher({ resolveHostname: resolvePublic }).deliver({
      webhook: { id: 'w', projectId: 'p', url: 'https://example.com', eventTypes: ['message.received'], secretHash: 'h', secretCiphertext: 'secret', status: 'active', consecutiveFailures: 0, createdAt: now, updatedAt: now } as Webhook,
      event: { id: 'e', version: 1, type: 'message.received', projectId: 'p', occurredAt: now, payload: {} },
      deliveryId: 'd', timestamp: now,
    });
    expect(result).toEqual({ ok: false, retryable: false });
  });
});
