import { describe, expect, it } from 'vitest';

import { createSendFn } from '../src/edge';
import { isBareEmail } from '../src/email/address';

describe('email address validation', () => {
  it('accepts the address shape supported by SendFn providers', () => {
    expect(isBareEmail('agent@example.com')).toBe(true);
    expect(isBareEmail('alerts+prod@sub.example.com')).toBe(true);
  });

  it('rejects whitespace, display names, incomplete domains, and repeated separators', () => {
    expect(isBareEmail('agent @example.com')).toBe(false);
    expect(isBareEmail('Agent <agent@example.com>')).toBe(false);
    expect(isBareEmail('agent@example')).toBe(false);
    expect(isBareEmail('agent@@example.com')).toBe(false);
  });

  it('parses display-name senders without regular-expression backtracking', async () => {
    const requests: Array<{ from: string; idempotencyKey?: string; replyTo?: string; headers?: Record<string, string> }> = [];
    const client = createSendFn({
      email: { from: '"Agent Team" <agent@example.com>' },
      emailProvider: {
        name: 'test',
        capabilities: {
          supportsTemplates: false,
          supportsAttachments: false,
          supportsBulkSend: false,
          supportsScheduling: false,
          maxRecipientsPerEmail: 1,
          maxAttachmentSize: 0,
        },
        async initialize() {},
        async sendEmail(request) {
          requests.push(request);
          return { success: true, messageId: 'msg_1', timestamp: new Date() };
        },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await client.email({
      idempotencyKey: 'edge-1',
      userId: 'user_1',
      replyTo: 'support@example.com',
      headers: { 'In-Reply-To': '<thread@example.com>' },
      to: 'recipient@example.com',
      subject: 'Hello',
    });
    expect(requests[0]?.from).toBe('Agent Team <agent@example.com>');
    expect(requests[0]?.idempotencyKey).toBe('edge-1');
    expect(requests[0]?.replyTo).toBe('support@example.com');
    expect(requests[0]?.headers).toEqual({ 'In-Reply-To': '<thread@example.com>' });
  });

  it('rejects control characters in edge sender display names', async () => {
    const client = createSendFn({
      email: { fromEmail: 'agent@example.com', fromName: 'Agent\r\nBcc: attacker@example.com' },
      emailProvider: {
        name: 'test',
        capabilities: {
          supportsTemplates: false,
          supportsAttachments: false,
          supportsBulkSend: false,
          supportsScheduling: false,
          maxRecipientsPerEmail: 1,
          maxAttachmentSize: 0,
        },
        async initialize() {},
        async sendEmail() { throw new Error('must not send'); },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });
    await expect(client.email({
      idempotencyKey: 'edge-1',
      userId: 'user_1',
      to: 'recipient@example.com',
      subject: 'Hello',
    })).rejects.toThrow('Display names cannot contain control characters');
  });

  it('rejects reply-to header injection before provider dispatch', async () => {
    let sendCalls = 0;
    const client = createSendFn({
      emailProvider: {
        name: 'test',
        capabilities: {
          supportsTemplates: false,
          supportsAttachments: false,
          supportsBulkSend: false,
          supportsScheduling: false,
          maxRecipientsPerEmail: 1,
          maxAttachmentSize: 0,
        },
        async initialize() {},
        async sendEmail() {
          sendCalls += 1;
          return { success: true, messageId: 'must-not-send', timestamp: new Date() };
        },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await expect(client.email({
      userId: 'user_1',
      replyTo: 'support@example.com\r\nBcc: attacker@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
    })).rejects.toThrow('Invalid replyTo');
    expect(sendCalls).toBe(0);
  });
});
