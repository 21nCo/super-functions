import { describe, expect, it } from 'vitest';

import { createSendFn } from '../src/edge';
import { isBareEmail } from '../src/email/address';
import { EmailTransactionSchema } from '../src/types';

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
          supportsIdempotency: true,
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

    const transaction = await client.email({
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
    expect(transaction.providerMessageId).toBe('msg_1');
    expect(() => EmailTransactionSchema.parse(transaction)).not.toThrow();
  });

  it('rejects control characters in edge sender display names', async () => {
    const client = createSendFn({
      email: { fromEmail: 'agent@example.com', fromName: 'Agent\r\nBcc: attacker@example.com' },
      emailProvider: {
        name: 'test',
        capabilities: {
          supportsIdempotency: true,
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

  it('rejects subject injection and preserves every edge recipient', async () => {
    let sendCalls = 0;
    const client = createSendFn({
      emailProvider: {
        name: 'test',
        capabilities: { supportsTemplates: false, supportsAttachments: true, supportsBulkSend: false, supportsScheduling: false, maxRecipientsPerEmail: 5, maxAttachmentSize: 1024 },
        async initialize() {},
        async sendEmail() { sendCalls += 1; return { success: true, messageId: 'sent', timestamp: new Date() }; },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await expect(client.email({
      userId: 'user_1', to: 'recipient@example.com', subject: 'Hello\r\nBcc: attacker@example.com',
      attachments: [{ filename: 'proof.txt', content: 'proof' }],
    })).rejects.toThrow('Invalid subject');
    expect(sendCalls).toBe(0);

    await expect(client.email({
      userId: 'user_1', to: ['one@example.com', 'two@example.com'], subject: 'Hello', text: 'Body',
    })).resolves.toMatchObject({ to: ['one@example.com', 'two@example.com'] });
  });

  it.each([
    ['to', { to: ['safe@example.com', 'victim@example.com\r\nBcc: attacker@example.com'] }],
    ['cc', { to: 'safe@example.com', cc: ['copy@example.com\nBcc: attacker@example.com'] }],
    ['bcc', { to: 'safe@example.com', bcc: ['blind@example.com\rX-Injected: yes'] }],
  ])('rejects control characters in edge %s recipients before provider dispatch', async (field, recipients) => {
    let sendCalls = 0;
    const client = createSendFn({
      emailProvider: {
        name: 'test',
        capabilities: { supportsTemplates: false, supportsAttachments: true, supportsBulkSend: false, supportsScheduling: false, maxRecipientsPerEmail: 5, maxAttachmentSize: 1024 },
        async initialize() {},
        async sendEmail() { sendCalls += 1; return { success: true, messageId: 'must-not-send', timestamp: new Date() }; },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await expect(client.email({
      userId: 'user_1', subject: 'Hello', text: 'Body',
      attachments: [{ filename: 'proof.txt', content: 'proof' }],
      ...recipients,
    })).rejects.toThrow(`Invalid ${field} recipient`);
    expect(sendCalls).toBe(0);
  });

  it.each([
    [{ Bcc: 'attacker@example.com' }, 'Bcc'],
    [{ 'X-Safe': 'ok\r\nBcc: attacker@example.com' }, 'X-Safe'],
  ])('rejects unsafe edge custom headers before provider dispatch', async (headers, rejectedName) => {
    let sendCalls = 0;
    const client = createSendFn({
      emailProvider: {
        name: 'test',
        capabilities: { supportsTemplates: false, supportsAttachments: false, supportsBulkSend: false, supportsScheduling: false, maxRecipientsPerEmail: 1, maxAttachmentSize: 0 },
        async initialize() {},
        async sendEmail() { sendCalls += 1; throw new Error('must not send'); },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await expect(client.email({ userId: 'user_1', to: 'recipient@example.com', subject: 'Hello', headers }))
      .rejects.toThrow(`Custom email header ${rejectedName} is not allowed`);
    expect(sendCalls).toBe(0);
  });

  it('honors per-message senders and rejects unsupported edge-only contracts', async () => {
    const requests: Array<{ from: string }> = [];
    const client = createSendFn({
      email: { from: 'Configured <configured@example.com>' },
      emailProvider: {
        name: 'test',
        capabilities: { supportsIdempotency: false, supportsTemplates: false, supportsAttachments: false, supportsBulkSend: false, supportsScheduling: false, maxRecipientsPerEmail: 1, maxAttachmentSize: 0 },
        async initialize() {},
        async sendEmail(request) { requests.push(request); return { success: true, messageId: 'sent', timestamp: new Date() }; },
        async sendBulkEmail() { return []; },
        validateEmail: isBareEmail,
        async isHealthy() { return true; },
        async close() {},
      },
    });

    await expect(client.email({
      userId: 'user_1', from: 'Message <message@example.com>', to: 'recipient@example.com', subject: 'Hello', text: 'Body',
    })).resolves.toMatchObject({ from: 'message@example.com' });
    expect(requests[0]?.from).toBe('Message <message@example.com>');

    await expect(client.email({
      userId: 'user_1', to: 'recipient@example.com', templateId: 'welcome', templateData: { name: 'Agent' },
    })).rejects.toThrow('does not render templates');
    await expect(client.email({
      idempotencyKey: 'edge-key', userId: 'user_1', to: 'recipient@example.com', subject: 'Hello', text: 'Body',
    })).rejects.toThrow('does not support idempotency keys');
    expect(requests).toHaveLength(1);
  });
});
