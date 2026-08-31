import { existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from '@superfunctions/db/adapters/memory';

import { createSendFnAdapter } from './index.js';

const localSendfnTest = existsSync(new URL('../../../sendfn/typescript/package.json', import.meta.url)) ? it : it.skip;

const request = {
  idempotencyKey: 'mailfn:draft:d',
  projectId: 'p', inboxId: 'i', from: 'agent@example.com', to: ['recipient@example.com'], cc: [], bcc: [],
  subject: 'Re: Test', text: 'Reply', headers: { 'In-Reply-To': '<m@example.com>' }, attachmentIds: ['a'],
  attachments: [{ id: 'a', filename: 'proof.txt', contentType: 'text/plain', content: new TextEncoder().encode('proof'), sha256: 'abc' }],
  metadata: { draftId: 'd' },
};

describe('SendFn composition', () => {
  it('uses the modern delivery contract without duplicating providers', async () => {
    const sendEmail = vi.fn(async () => ({ providerMessageId: 'provider-1', status: 'sent' }));
    await expect(createSendFnAdapter({ sendEmail }).send(request)).resolves.toEqual({ providerMessageId: 'provider-1', status: 'sent' });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: request.idempotencyKey, from: request.from, headers: request.headers,
      attachments: [expect.objectContaining({ filename: 'proof.txt', contentType: 'text/plain' })],
      metadata: expect.objectContaining({
        draftId: 'd', mailfnInboxId: 'i', mailfnIdempotencyKey: request.idempotencyKey,
        mailfnHeaders: JSON.stringify(request.headers), mailfnAttachmentIds: JSON.stringify(['a']),
      }),
    }));
  });

  it('rejects failed SendFn transactions instead of presenting them as queued', async () => {
    const sendEmail = vi.fn(async () => ({ id: 'tx-failed', status: 'failed' }));
    await expect(createSendFnAdapter({ sendEmail }).send(request)).rejects.toThrow('SENDFN_DELIVERY_FAILED');
  });

  it('preserves MailFn correlation and threading metadata on the legacy SendFn surface', async () => {
    const email = vi.fn(async () => ({ id: 'tx-1', status: 'pending' }));
    await expect(createSendFnAdapter({ email }).send(request)).resolves.toEqual({ providerMessageId: 'tx-1', status: 'queued' });
    expect(email).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: request.idempotencyKey,
      userId: 'p', from: request.from, replyTo: request.from, headers: request.headers,
      attachments: [expect.objectContaining({ filename: 'proof.txt', contentType: 'text/plain' })],
      metadata: expect.objectContaining({ mailfnInboxId: 'i', mailfnHeaders: request.headers, mailfnAttachmentIds: ['a'], mailfnIdempotencyKey: request.idempotencyKey }),
    }));
  });

  localSendfnTest('composes against the checked-in SendFn service and reaches its provider contract intact', async () => {
    const { Sendfn } = await import('sendfn');
    const providerRequests: Array<Record<string, unknown>> = [];
    const provider = {
      name: 'mailfn-integration',
      capabilities: {
        supportsTemplates: true, supportsAttachments: true, supportsBulkSend: true, supportsScheduling: false,
        maxRecipientsPerEmail: 50, maxAttachmentSize: 10 * 1024 * 1024,
      },
      async initialize() {},
      async close() {},
      async isHealthy() { return true; },
      validateEmail() { return true; },
      async sendBulkEmail() { return []; },
      async sendEmail(input: Record<string, unknown>) {
        providerRequests.push(input);
        return { success: true, providerMessageId: 'actual-sendfn-provider', timestamp: new Date() };
      },
    };
    const actualSendFn = new Sendfn({
      database: memoryAdapter(),
      emailProvider: provider as never,
      email: { fromEmail: 'fallback@example.com' },
      options: { suppressionEnabled: false, retryAttempts: 1, retryDelay: 0 },
    });
    const adapter = createSendFnAdapter(actualSendFn);
    await expect(adapter.send(request)).resolves.toEqual({
      providerMessageId: 'actual-sendfn-provider', status: 'sent',
    });
    await expect(adapter.send(request)).resolves.toEqual({
      providerMessageId: 'actual-sendfn-provider', status: 'sent',
    });
    expect(providerRequests).toMatchObject([{
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      from: request.from,
      replyTo: request.from,
      headers: request.headers,
      attachments: [{ filename: 'proof.txt', contentType: 'text/plain' }],
      metadata: expect.objectContaining({ mailfnIdempotencyKey: request.idempotencyKey }),
    }]);
    expect(providerRequests[0]?.idempotencyKey).not.toBe(request.idempotencyKey);
    await actualSendFn.close();
  });
});
