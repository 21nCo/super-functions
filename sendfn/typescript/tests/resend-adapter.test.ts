import { afterEach, describe, expect, it, vi } from 'vitest';
import { resendAdapter } from '../src';

const originalFetch = globalThis.fetch;

describe('ResendAdapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends email through the Resend HTTP API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = resendAdapter({ apiKey: 're_test', endpoint: 'https://resend.test/emails' });
    const result = await adapter.sendEmail({
      from: 'E11y <hello@example.com>',
      to: ['ada@example.com'],
      subject: 'Your code',
      html: '<p>123456</p>',
      text: '123456',
      replyTo: 'support@example.com',
      metadata: { challengeId: 'otp_123' },
      tags: { source: 'authfn' },
      attachments: [{ filename: 'code.txt', content: new TextEncoder().encode('123456') }],
    });

    expect(result).toMatchObject({
      success: true,
      messageId: 'email_123',
      providerMessageId: 'email_123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://resend.test/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      from: 'E11y <hello@example.com>',
      to: ['ada@example.com'],
      subject: 'Your code',
      reply_to: 'support@example.com',
      tags: [{ name: 'source', value: 'authfn' }],
      attachments: [{ filename: 'code.txt', content: 'MTIzNDU2' }],
    });
  });

  it('returns retryability from Resend HTTP status', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'slow down' }), { status: 429 })) as typeof fetch;

    const result = await resendAdapter({ apiKey: 're_test' }).sendEmail({
      from: 'hello@example.com',
      to: ['ada@example.com'],
      subject: 'Your code',
      html: '<p>123456</p>',
    });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'rate_limit_exceeded',
        message: 'slow down',
        retryable: true,
      },
    });
  });
});
