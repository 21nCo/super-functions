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
    const requests: Array<{ from: string }> = [];
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

    await client.email({ userId: 'user_1', to: 'recipient@example.com', subject: 'Hello' });
    expect(requests[0]?.from).toBe('Agent Team <agent@example.com>');
  });
});
