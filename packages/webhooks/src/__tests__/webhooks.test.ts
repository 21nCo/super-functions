import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deliverWebhook,
  signWebhookPayload,
  verifyStandardWebhookSignature,
  verifyWebhookSignature
} from '../index.js';

const { undiciFetchMock } = vi.hoisted(() => ({ undiciFetchMock: vi.fn() }));

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  return { ...actual, fetch: undiciFetchMock };
});

const resolvePublicHostname = async () => ['93.184.216.34'] as const;

beforeEach(() => {
  undiciFetchMock.mockReset();
});

describe('webhooks package exports', () => {
  it('signs and verifies webhook payload using timing-safe verification path', () => {
    const payload = JSON.stringify({ event: 'bot.joined', id: 'evt_1' });
    const secret = 'whsec_test';

    const signature = signWebhookPayload(payload, secret);
    expect(signature).toMatch(/^[a-f0-9]+$/);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(payload, 'bad-signature', secret)).toBe(false);
  });

  it('supports prefixed signature verification', () => {
    const payload = '{"ok":true}';
    const secret = 'secret';
    const signature = signWebhookPayload(payload, secret, { prefix: 'sha256=' });
    expect(verifyWebhookSignature(payload, signature, secret, { prefix: 'sha256=' })).toBe(true);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
  });

  it('accepts canonical base64 signatures with or without padding', () => {
    const payload = '{"ok":true}';
    const secret = 'secret';
    const signature = signWebhookPayload(payload, secret, { encoding: 'base64' });

    expect(verifyWebhookSignature(payload, signature, secret, { encoding: 'base64' })).toBe(true);
    expect(
      verifyWebhookSignature(payload, signature.replace(/=+$/, ''), secret, { encoding: 'base64' })
    ).toBe(true);
    expect(
      verifyWebhookSignature(payload, `${signature}!!`, secret, { encoding: 'base64' })
    ).toBe(false);
    expect(
      verifyWebhookSignature(payload, `${signature}=`, secret, { encoding: 'base64' })
    ).toBe(false);
  });

  it('verifies Standard Webhooks signatures and rotated signature lists', () => {
    const payload = '{"type":"subscription.renewed"}';
    const id = 'msg_123';
    const timestamp = '1776038400';
    const secretBytes = Buffer.from('standard-webhook-secret');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const signature = createHmac('sha256', secretBytes)
      .update(`${id}.${timestamp}.${payload}`)
      .digest('base64');

    expect(verifyStandardWebhookSignature(payload, {
      id,
      timestamp,
      signature: `v1,invalid v1,${signature}`
    }, secret, {
      now: () => Number(timestamp) * 1000
    })).toBe(true);
  });

  it('rejects stale or malformed Standard Webhooks signatures', () => {
    const payload = '{}';
    const secretBytes = Buffer.from('standard-webhook-secret');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const timestamp = '1776038000';
    const validSignature = createHmac('sha256', secretBytes)
      .update(`msg_123.${timestamp}.${payload}`)
      .digest('base64');

    expect(verifyStandardWebhookSignature(payload, {
      id: 'msg_123',
      timestamp,
      signature: 'v1,invalid'
    }, secret, {
      now: () => 1776038400 * 1000,
      toleranceSeconds: 300
    })).toBe(false);

    expect(verifyStandardWebhookSignature(payload, {
      id: 'msg_123',
      timestamp,
      signature: `v1,${validSignature}`
    }, secret, {
      now: () => Number.NaN
    })).toBe(false);
  });

  it('delivers payload with bounded retries and returns structured attempts', async () => {
    let attempt = 0;
    const fetchMock = undiciFetchMock.mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) {
        return { ok: false, status: 500 };
      }

      return { ok: true, status: 200 };
    });

    const result = await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        secret: 'whsec_test',
        signatureHeader: 'X-Test-Signature',
      },
      {
        resolveHostname: resolvePublicHostname,
        maxRetries: 3,
        initialDelayMs: 1,
        maxDelayMs: 2,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0]).toMatchObject({ attempt: 1, ok: false, status: 500 });
    expect(result.attempts[2]).toMatchObject({ attempt: 3, ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns a structured failure when JSON serialization yields undefined', async () => {
    const result = await deliverWebhook({
      url: 'https://example.com/hook',
      payload: undefined,
    });

    expect(result).toEqual({
      ok: false,
      attempts: [
        {
          attempt: 1,
          ok: false,
          error: 'Webhook payload must be JSON-serializable',
        },
      ],
    });
  });

  it('does not retry non-transient HTTP failures', async () => {
    const fetchMock = undiciFetchMock.mockImplementation(async () => ({ ok: false, status: 400 }));

    const result = await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
      },
      {
        resolveHostname: resolvePublicHostname,
        maxRetries: 3,
        initialDelayMs: 1,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a hanging attempt using the configured per-attempt timeout', async () => {
    undiciFetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const result = await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
      },
      {
        resolveHostname: resolvePublicHostname,
        maxRetries: 1,
        perAttemptTimeoutMs: 5,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts[0]).toMatchObject({
      attempt: 1,
      ok: false,
      error: 'The operation was aborted.',
    });
  });

  it('canonicalizes content-type and signature headers before delivery', async () => {
    const fetchMock = undiciFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: init?.headers,
      } as Response;
    });

    await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        secret: 'whsec_test',
        signatureHeader: 'X-Webhook-Signature',
        headers: {
          'content-type': 'application/cloudevents+json',
          'Content-Type': 'application/problem+json',
          'x-webhook-signature': 'stale-signature',
          'X-WEBHOOK-SIGNATURE': 'staler-signature',
        },
      },
      {
        resolveHostname: resolvePublicHostname,
      }
    );

    const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(sentHeaders).toMatchObject({
      'Content-Type': 'application/problem+json',
      'X-Webhook-Signature': expect.any(String),
    });
    expect(Object.keys(sentHeaders).filter((key) => key.toLowerCase() === 'content-type')).toEqual(['Content-Type']);
    expect(Object.keys(sentHeaders).filter((key) => key.toLowerCase() === 'x-webhook-signature')).toEqual([
      'X-Webhook-Signature',
    ]);
  });

  it('prefers the latest content-type variant when canonicalizing headers', async () => {
    const fetchMock = undiciFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: init?.headers,
      } as Response;
    });

    await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        headers: {
          'Content-Type': 'application/problem+json',
          'content-type': 'application/cloudevents+json',
        },
      },
      {
        resolveHostname: resolvePublicHostname,
      }
    );

    const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(sentHeaders['Content-Type']).toBe('application/cloudevents+json');
  });

  it('forces application/json when caller supplies a non-json content type', async () => {
    const fetchMock = undiciFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: init?.headers,
      } as Response;
    });

    await deliverWebhook(
      {
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        headers: {
          'content-type': 'text/plain',
        },
      },
      {
        resolveHostname: resolvePublicHostname,
      }
    );

    const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(sentHeaders['Content-Type']).toBe('application/json');
  });

  it('rejects non-finite maxRetries before skipping delivery attempts', async () => {
    await expect(
      deliverWebhook(
        {
          url: 'https://example.com/hook',
          payload: { hello: 'world' },
        },
        {
          maxRetries: Number.NaN,
        }
      )
    ).rejects.toThrow('WEBHOOK_MAX_RETRIES_INVALID');
  });

  it('rejects non-finite webhook timing options before scheduling retries', async () => {
    await expect(
      deliverWebhook(
        {
          url: 'https://example.com/hook',
          payload: { hello: 'world' },
        },
        {
          initialDelayMs: Number.NaN,
        }
      )
    ).rejects.toThrow('WEBHOOK_INITIAL_DELAY_INVALID');

    await expect(
      deliverWebhook(
        {
          url: 'https://example.com/hook',
          payload: { hello: 'world' },
        },
        {
          maxDelayMs: Number.NaN,
        }
      )
    ).rejects.toThrow('WEBHOOK_MAX_DELAY_INVALID');

    await expect(
      deliverWebhook(
        {
          url: 'https://example.com/hook',
          payload: { hello: 'world' },
        },
        {
          perAttemptTimeoutMs: Number.NaN,
        }
      )
    ).rejects.toThrow('WEBHOOK_PER_ATTEMPT_TIMEOUT_INVALID');
  });

  it('rejects an explicitly empty signing secret instead of sending an unsigned webhook', async () => {
    await expect(
      deliverWebhook({
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        secret: '',
      })
    ).rejects.toThrow('WEBHOOK_SECRET_INVALID');
  });

  it('rejects blank signature header names before sending a signed webhook', async () => {
    await expect(
      deliverWebhook({
        url: 'https://example.com/hook',
        payload: { hello: 'world' },
        secret: 'whsec_test',
        signatureHeader: '   ',
      })
    ).rejects.toThrow('WEBHOOK_SIGNATURE_HEADER_INVALID');
  });

  it('refuses to deliver to non-http(s) URL schemes (SSRF guard)', async () => {
    const fetchMock = undiciFetchMock;
    const result = await deliverWebhook({ url: 'file:///etc/passwd', payload: { hello: 'world' } });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.attempts[0]?.error).toContain('scheme not allowed');
  });

  it('refuses to deliver to a malformed URL', async () => {
    const fetchMock = undiciFetchMock;
    const result = await deliverWebhook({ url: 'not a url', payload: { hello: 'world' } });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1/hook',
    'http://10.0.0.1/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/hook',
    'http://[::10.0.0.5]/hook',
    'http://[64:ff9b::10.0.0.5]/hook',
    'http://[fd00::1]/hook',
    'http://[fe80::1]/hook',
  ])('refuses to deliver to a non-public literal address: %s', async (url) => {
    const fetchMock = undiciFetchMock;
    const resolver = vi.fn(resolvePublicHostname);

    const result = await deliverWebhook(
      { url, payload: { hello: 'world' } },
      {
        resolveHostname: resolver,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('non-public address');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it.each([
    'http://localhost/hook',
    'http://api.localhost/hook',
    'http://foo.localhost./hook',
  ])('refuses to deliver to a localhost-style hostname: %s', async (url) => {
    const fetchMock = undiciFetchMock;
    const resolver = vi.fn(resolvePublicHostname);

    const result = await deliverWebhook(
      { url, payload: { hello: 'world' } },
      {
        resolveHostname: resolver,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('not public');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it.each([
    ['resolver error', async () => { throw new Error('dns unavailable'); }],
    ['empty result', async () => []],
  ] as const)('refuses delivery after a DNS %s', async (_label, resolveHostname) => {
    const fetchMock = undiciFetchMock;

    const result = await deliverWebhook(
      { url: 'https://hooks.example.com/delivery', payload: { hello: 'world' } },
      {
        resolveHostname,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('could not be resolved');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a pinned dispatcher to the actual webhook request', async () => {
    const fetchMock = undiciFetchMock.mockImplementation(
      async () => ({ ok: true, status: 200 }) as Response
    );

    const result = await deliverWebhook(
      { url: 'https://hooks.example.com/delivery', payload: { hello: 'world' } },
      {
        resolveHostname: resolvePublicHostname,
      }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty('dispatcher');
  });

  it('resolves hostnames and refuses delivery when any address is non-public', async () => {
    const fetchMock = undiciFetchMock;
    const resolver = vi.fn(async () => ['93.184.216.34', '10.0.0.5']);

    const result = await deliverWebhook(
      { url: 'https://hooks.example.com/delivery', payload: { hello: 'world' } },
      {
        resolveHostname: resolver,
      }
    );

    expect(result.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('10.0.0.5');
    expect(resolver).toHaveBeenCalledWith('hooks.example.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
