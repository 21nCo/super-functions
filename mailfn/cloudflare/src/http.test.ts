import { describe, expect, it } from 'vitest';

import { MailFn, MemoryMailFnObjectStore, MemoryMailFnStore, noOpSecretProtector, type ParsedMessage } from '@mailfn/core';
import { createMailFnHttpHandler, createMailFnRouter } from './http.js';

describe('MailFn Cloudflare HTTP API', () => {
  it('serves lifecycle APIs with envelopes, scoped authorization, binary evidence, and CORS', async () => {
    const mailfn = new MailFn({
      store: new MemoryMailFnStore(), objects: new MemoryMailFnObjectStore(), defaultDomain: 'inbound.example.com',
      secretProtector: noOpSecretProtector,
      publicPlatform: { supportEnabled: true, billingEnabled: true },
      mimeParser: { async parse(): Promise<ParsedMessage> {
        return {
          from: [{ address: 'sender@example.com' }], to: [{ address: 'one@inbound.example.com' }], subject: 'Code',
          text: 'Code is 123456', headers: {}, attachments: [{ filename: 'proof.txt', contentType: 'text/plain', content: new TextEncoder().encode('proof') }],
        };
      } },
    });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'api', displayName: 'API' });
    const handler = createMailFnHttpHandler({ mailfn, corsOrigins: ['https://app.example.com'] });
    const request = (path: string, init: RequestInit = {}, token = bootstrap.credential.token) => handler(new Request(`https://mailfn.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Origin: 'https://app.example.com', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    }));
    const createdResponse = await request('/v1/inboxes', {
      method: 'POST', body: JSON.stringify({ kind: 'expiring', requestedLocalPart: 'one', expirySeconds: 3600, idempotencyKey: 'api-one' }),
    });
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    const created = (await createdResponse.json() as { data: { inbox: { id: string; address: string }; credential: { token: string } } }).data;
    const actor = await mailfn.authenticate(bootstrap.credential.token);
    const second = await mailfn.createInbox(actor, { projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'two', expirySeconds: 3600 });
    const secondToken = second.credential.token;
    expect((await request(`/v1/inboxes/${created.inbox.id}`, {}, secondToken)).status).toBe(403);

    const raw = new TextEncoder().encode('Subject: Code\r\n\r\nCode is 123456');
    const message = await mailfn.receiveInbound({ providerDeliveryId: 'api-delivery', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, raw, rawSize: raw.byteLength });
    const scopedToken = created.credential.token;
    const list = await request(`/v1/inboxes/${created.inbox.id}/messages`, {}, scopedToken);
    expect((await list.json() as { data: { items: Array<{ id: string }> } }).data.items[0]?.id).toBe(message.id);
    const evidence = await request(`/v1/inboxes/${created.inbox.id}/messages/${message.id}/raw`, {}, scopedToken);
    expect(evidence.headers.get('Cache-Control')).toBe('private, no-store');
    expect(new TextDecoder().decode(await evidence.arrayBuffer())).toContain('123456');
    const attachmentList = await request(`/v1/inboxes/${created.inbox.id}/messages/${message.id}/attachments`, {}, scopedToken);
    const descriptors = (await attachmentList.json() as { data: Array<{ id: string; filename: string; objectKey?: string }> }).data;
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({ filename: 'proof.txt' });
    expect(descriptors[0]).not.toHaveProperty('objectKey');
    const extraction = await request(`/v1/inboxes/${created.inbox.id}/messages/${message.id}/extract`, {
      method: 'POST', body: JSON.stringify({ type: 'otp' }),
    }, scopedToken);
    expect((await extraction.json() as { data: { value: string; sourceMessageId: string } }).data).toEqual({
      type: 'otp', value: '123456', sourceMessageId: message.id, receivedAt: message.receivedAt, matchedField: 'text',
    });

    expect((await request('/v1/compliance', {
      method: 'PUT',
      body: JSON.stringify({ dataRegion: 'global', retentionLocked: false, exportEnabled: true, deletionSlaHours: 24 }),
    })).status).toBe(200);
    const exported = await request('/v1/compliance/export');
    expect(await exported.json()).toMatchObject({ data: { project: { id: bootstrap.project.id }, messages: [{ id: message.id }] } });

    const supportResponse = await request('/v1/support/cases', {
      method: 'POST', body: JSON.stringify({ subject: 'Help', severity: 'normal', description: 'Review delivery' }),
    });
    const support = (await supportResponse.json() as { data: { id: string } }).data;
    expect((await request(`/v1/support/cases/${support.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'resolved' }),
    })).status).toBe(200);
    const abuseResponse = await request('/v1/abuse', {
      method: 'POST', body: JSON.stringify({ kind: 'spam', resourceType: 'message', resourceId: message.id, reason: 'complaint' }),
    });
    const abuse = (await abuseResponse.json() as { data: { id: string } }).data;
    expect((await request(`/v1/abuse/${abuse.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'investigating' }),
    })).status).toBe(200);
    expect(await (await request('/v1/abuse')).json()).toMatchObject({ data: [{ id: abuse.id, status: 'investigating' }] });
    expect(await (await request('/v1/reputation')).json()).toMatchObject({
      data: [{ sender: 'sender@example.com', status: 'monitor', score: 70 }],
    });
    expect((await request('/v1/reputation/sender%40example.com', {
      method: 'PUT', body: JSON.stringify({ status: 'block', score: 0, reason: 'operator block' }),
    })).status).toBe(200);
  });

  it('returns typed errors and never reflects credentials', async () => {
    const mailfn = new MailFn({ store: new MemoryMailFnStore(), objects: new MemoryMailFnObjectStore(), defaultDomain: 'inbound.example.com' });
    const router = createMailFnRouter({ mailfn });
    expect(router.getRoutes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: '/health', meta: { auth: { mode: 'none' } } }),
      expect.objectContaining({ method: 'GET', path: '/v1/inboxes', meta: { auth: { mode: 'bearer' } } }),
    ]));
    const handler = createMailFnHttpHandler({ mailfn });
    const secret = 'not-a-valid-token';
    const response = await handler(new Request('https://mailfn.test/v1/inboxes', { headers: { Authorization: `Bearer ${secret}` } }));
    const body = await response.text();
    expect(response.status).toBe(401);
    expect(body).toContain('MAILFN_UNAUTHORIZED');
    expect(body).not.toContain(secret);
    const missing = await handler(new Request('https://mailfn.test/v1/not-a-route', { headers: { Authorization: `Bearer ${secret}` } }));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'MAILFN_NOT_FOUND' } });
  });

  it('lets token-manage-only credentials revoke inbox tokens without inbox-read scope', async () => {
    const mailfn = new MailFn({
      store: new MemoryMailFnStore(), objects: new MemoryMailFnObjectStore(), defaultDomain: 'inbound.example.com',
    });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'token-manager', displayName: 'Token Manager' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const first = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'managed', expirySeconds: 3_600,
    });
    const second = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'other', expirySeconds: 3_600,
    });
    const manager = await mailfn.createCredential(admin, {
      projectId: bootstrap.project.id, permissions: ['token:manage'],
    });
    const handler = createMailFnHttpHandler({ mailfn });
    const request = (path: string, init: RequestInit = {}) => handler(new Request(`https://mailfn.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${manager.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    }));
    const createResponse = await request(`/v1/inboxes/${first.inbox.id}/tokens`, {
      method: 'POST', body: JSON.stringify({ permissions: ['token:manage'] }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json() as { data: { credential: { id: string } } }).data;

    expect((await request(`/v1/inboxes/${second.inbox.id}/tokens/${created.credential.id}`, { method: 'DELETE' })).status).toBe(404);
    const revokeResponse = await request(`/v1/inboxes/${first.inbox.id}/tokens/${created.credential.id}`, { method: 'DELETE' });
    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toMatchObject({ data: { id: created.credential.id, status: 'revoked' } });
  });
});
