import { describe, expect, it, vi } from 'vitest';

import type { Message } from '@mailfn/core';
import { assertAttachments, assertMessage, assertMessageWithClient, createInboxFixture, MailFnAssertionError, waitForOtp } from './index.js';

const message: Message = {
  id: 'm', projectId: 'p', inboxId: 'i', providerDeliveryId: 'd', envelopeFrom: 'sender@example.com', envelopeTo: 'test@example.com',
  from: [{ address: 'sender@example.com' }], to: [{ address: 'test@example.com' }], cc: [], bcc: [], replyTo: [],
  subject: 'Verification', receivedAt: '2026-08-10T00:00:00.000Z', textBody: 'Code is 123456', headers: { 'x-run': ['run-1'] },
  rawObjectKey: 'raw', rawRetentionExpiresAt: '2026-08-11T00:00:00.000Z',
  attachmentRetentionExpiresAt: '2026-08-11T00:00:00.000Z', references: [], authenticationResults: {}, sizeBytes: 10, status: 'ready', labels: [],
  retentionExpiresAt: '2026-08-11T00:00:00.000Z', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
};

describe('@mailfn/testing', () => {
  it('creates idempotent expiring fixtures and disposes once', async () => {
    const createInbox = vi.fn(async () => ({
      inbox: { id: 'i', address: 'test@example.com', kind: 'expiring' as const, status: 'active' as const, projectId: 'p', metadata: {}, labels: [], createdAt: '', updatedAt: '' },
      credential: { credential: { id: 'c', projectId: 'p', inboxId: 'i', tokenHash: 'h', tokenPrefix: 'x', permissions: [], status: 'active' as const, createdAt: '' }, token: 'secret' },
    }));
    const deleteInbox = vi.fn(async () => undefined);
    const fixture = await createInboxFixture({ createInbox, deleteInbox, listMessages: vi.fn(), listAttachments: vi.fn(), waitForMessages: vi.fn() }, { testRunId: 'run-1' });
    expect(fixture.token).toBe('secret');
    expect(createInbox).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'test:run-1:generated' }));
    await fixture.dispose(); await fixture.dispose();
    expect(deleteInbox).toHaveBeenCalledTimes(1);
  });

  it('allows fixture disposal to retry after a transient delete failure', async () => {
    const createInbox = vi.fn(async () => ({
      inbox: { id: 'i', address: 'test@example.com', kind: 'expiring' as const, status: 'active' as const, projectId: 'p', metadata: {}, labels: [], createdAt: '', updatedAt: '' },
      credential: { credential: { id: 'c', projectId: 'p', inboxId: 'i', tokenHash: 'h', tokenPrefix: 'x', permissions: [], status: 'active' as const, createdAt: '' }, token: 'secret' },
    }));
    const deleteInbox = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(undefined);
    const fixture = await createInboxFixture({
      createInbox, deleteInbox, listMessages: vi.fn(), listAttachments: vi.fn(), waitForMessages: vi.fn(),
    }, { testRunId: 'retry' });
    await expect(fixture.dispose()).rejects.toThrow('temporary');
    await expect(fixture.dispose()).resolves.toBeUndefined();
    expect(deleteInbox).toHaveBeenCalledTimes(2);
  });

  it('extracts source-attributed OTPs and provides focused assertions', async () => {
    const client = {
      createInbox: vi.fn(), deleteInbox: vi.fn(), listMessages: vi.fn(), listAttachments: vi.fn(),
      waitForMessages: vi.fn(async () => ({ status: 'matched' as const, messages: [message], matchedAt: '' })),
    };
    await expect(waitForOtp(client, 'i', { timeoutMs: 100 })).resolves.toMatchObject({ value: '123456', sourceMessageId: 'm' });
    expect(() => assertMessage({ message, sender: 'sender@example.com', subjectIncludes: 'Verif', textIncludes: '123456', header: { name: 'X-Run', includes: 'run-1' } })).not.toThrow();
    expect(() => assertMessage({ message, sender: 'wrong@example.com' })).toThrow(MailFnAssertionError);
    expect(() => assertAttachments(
      [{ filename: 'proof.txt', contentType: 'text/plain', sizeBytes: 8, sha256: 'abc' }],
      [{ filename: 'proof.txt', minSizeBytes: 1, sha256: 'abc' }],
    )).not.toThrow();
    await expect(assertMessageWithClient(
      { listAttachments: vi.fn(async () => [{
        id: 'a', inboxId: 'i', messageId: 'm', filename: 'proof.txt', contentType: 'text/plain',
        sizeBytes: 8, sha256: 'abc', createdAt: '',
      }]) },
      { message, attachment: { filename: 'proof.txt', contentType: 'text/plain' } },
    )).resolves.toBeUndefined();
  });
});
