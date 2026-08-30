import { describe, expect, it, vi } from 'vitest';

import { MailFnClient } from './client.js';
import { MailFnClientError } from './errors.js';

function envelope(data: unknown, status = 200, error: unknown = null): Response {
  return Response.json({ ok: status < 400, data: status < 400 ? data : null, error, meta: { requestId: 'req_1', version: 'v1' } }, { status });
}

describe('MailFnClient', () => {
  it('retries safe reads and idempotent inbox creation only', async () => {
    const readFetch = vi.fn()
      .mockResolvedValueOnce(envelope(null, 503, { code: 'MAILFN_STORAGE_FAILED', message: 'down', retryable: true }))
      .mockResolvedValueOnce(envelope([]));
    await expect(new MailFnClient({ baseUrl: 'https://mailfn.test////', token: 'token', fetch: readFetch, retries: 1 }).listInboxes()).resolves.toEqual([]);
    expect(readFetch).toHaveBeenCalledTimes(2);

    const createFetch = vi.fn()
      .mockResolvedValueOnce(envelope(null, 503, { code: 'MAILFN_STORAGE_FAILED', message: 'down', retryable: true }))
      .mockResolvedValueOnce(envelope(null, 503, { code: 'MAILFN_STORAGE_FAILED', message: 'down', retryable: true }))
      .mockResolvedValueOnce(envelope({ inbox: { id: 'i' } }));
    const client = new MailFnClient({ baseUrl: 'https://mailfn.test', token: 'token', fetch: createFetch, retries: 1 });
    await expect(client.createInbox({ kind: 'expiring' })).rejects.toBeInstanceOf(MailFnClientError);
    expect(createFetch).toHaveBeenCalledTimes(1);
    await expect(client.createInbox({ kind: 'expiring', idempotencyKey: 'run-1' })).resolves.toMatchObject({ inbox: { id: 'i' } });
    expect(createFetch).toHaveBeenCalledTimes(3);
  });

  it('builds filter routes, passes cancellation, and returns typed API errors', async () => {
    const fetcher = vi.fn(async (requestUrl: string | URL | Request, init?: RequestInit) => {
      const url = String(requestUrl);
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer scoped' });
      if (url.includes('/messages?')) {
        expect(url).toContain('sender=sender%40example.com');
        expect(url).toContain('labels=verification');
        return envelope({ items: [], nextCursor: undefined });
      }
      return envelope(null, 403, { code: 'MAILFN_FORBIDDEN', message: 'forbidden', retryable: false });
    });
    const client = new MailFnClient({ baseUrl: 'https://mailfn.test', token: async () => 'scoped', fetch: fetcher });
    await client.listMessages('inb_1', { sender: 'sender@example.com', labels: ['verification'] });
    await expect(client.getInbox('inb_other')).rejects.toMatchObject({
      code: 'MAILFN_FORBIDDEN', status: 403, retryable: false, requestId: 'req_1',
    });
  });

  it('does not leak binary error bodies into success data', async () => {
    const client = new MailFnClient({
      baseUrl: 'https://mailfn.test', token: 'scoped',
      fetch: async () => envelope(null, 404, { code: 'MAILFN_NOT_FOUND', message: 'missing', retryable: false }),
    });
    await expect(client.readRaw('i', 'm')).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND', status: 404 });
  });

  it('does not start pre-cancelled requests and removes retry listeners after backoff', async () => {
    const cancelledFetch = vi.fn();
    const cancelled = new AbortController();
    cancelled.abort();
    const client = new MailFnClient({ baseUrl: 'https://mailfn.test', token: 'scoped', fetch: cancelledFetch });
    await expect(client.listInboxes({ signal: cancelled.signal })).rejects.toMatchObject({
      code: 'MAILFN_NETWORK_ERROR', retryable: false,
    });
    expect(cancelledFetch).not.toHaveBeenCalled();

    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const retryFetch = vi.fn()
      .mockResolvedValueOnce(envelope(null, 503, { code: 'MAILFN_STORAGE_FAILED', message: 'down', retryable: true }))
      .mockResolvedValueOnce(envelope([]));
    await new MailFnClient({
      baseUrl: 'https://mailfn.test', token: 'scoped', fetch: retryFetch, retries: 1,
    }).listInboxes({ signal: controller.signal });
    expect(removed).toHaveBeenCalledTimes(added.mock.calls.length);
  });

  it('discovers attachment metadata and returns it with downloaded bytes', async () => {
    const descriptor = {
      id: 'a', inboxId: 'i', messageId: 'm', filename: 'proof.txt', contentType: 'text/plain',
      sizeBytes: 5, sha256: 'abc', createdAt: '2026-08-10T00:00:00.000Z',
    };
    const client = new MailFnClient({
      baseUrl: 'https://mailfn.test', token: 'scoped',
      fetch: async (requestUrl) => String(requestUrl).endsWith('/attachments')
        ? envelope([descriptor])
        : new Response(new TextEncoder().encode('proof'), { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    await expect(client.downloadAttachment('i', 'm', 'a')).resolves.toMatchObject({
      attachment: descriptor,
      data: new TextEncoder().encode('proof'),
    });
  });

  it('exposes forward, search, and operational alert response shapes', async () => {
    const paths: string[] = [];
    const client = new MailFnClient({
      baseUrl: 'https://mailfn.test',
      token: 'scoped',
      fetch: async (requestUrl, init) => {
        paths.push(`${init?.method ?? 'GET'} ${String(requestUrl)}`);
        if (String(requestUrl).endsWith('/v1/operations/snapshot')) {
          return envelope({ snapshot: { generatedAt: 'now' }, alerts: [{ code: 'QUEUE', severity: 'warning' }] });
        }
        if (String(requestUrl).includes('/messages/search')) return envelope({ items: [] });
        return envelope({ id: 'draft_1', status: 'draft' });
      },
    });
    await expect(client.searchMessages('inb_1', { query: 'needle' })).resolves.toEqual({ items: [] });
    await expect(client.createForwardDraft('inb_1', 'msg_1', { to: ['next@example.com'] })).resolves.toMatchObject({ id: 'draft_1' });
    await expect(client.getOperationalSnapshot()).resolves.toMatchObject({ alerts: [{ code: 'QUEUE' }] });
    expect(paths).toEqual([
      'GET https://mailfn.test/v1/inboxes/inb_1/messages/search?query=needle',
      'POST https://mailfn.test/v1/inboxes/inb_1/messages/msg_1/forward',
      'GET https://mailfn.test/v1/operations/snapshot',
    ]);
  });

  it('exposes domain disablement, compliance export, abuse, and support management routes', async () => {
    const paths: string[] = [];
    const client = new MailFnClient({
      baseUrl: 'https://mailfn.test', token: 'admin',
      fetch: async (requestUrl, init) => {
        paths.push(`${init?.method ?? 'GET'} ${new URL(String(requestUrl)).pathname}`);
        return envelope(String(requestUrl).endsWith('/export') ? { generatedAt: 'now' } : []);
      },
    });
    await client.disableDomain('dom_1');
    await client.configureCompliance({ dataRegion: 'global', retentionLocked: false, exportEnabled: true, deletionSlaHours: 24 });
    await client.exportCompliance();
    await client.listAbuseCases();
    await client.updateAbuseCase('abu_1', { status: 'resolved' });
    await client.listSenderReputations();
    await client.updateSenderReputation('sender@example.com', { status: 'block', score: 0 });
    await client.listSupportCases();
    await client.updateSupportCase('sup_1', { status: 'waiting' });
    expect(paths).toEqual([
      'DELETE /v1/domains/dom_1',
      'PUT /v1/compliance',
      'GET /v1/compliance/export',
      'GET /v1/abuse',
      'PATCH /v1/abuse/abu_1',
      'GET /v1/reputation',
      'PUT /v1/reputation/sender%40example.com',
      'GET /v1/support/cases',
      'PATCH /v1/support/cases/sup_1',
    ]);
  });
});
