/// <reference types="@cloudflare/vitest-pool-workers" />

import {
  createExecutionContext,
  createMessageBatch,
  env,
  getQueueResult,
  SELF,
} from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ParseJob } from '@mailfn/core';
import type { D1Database, Queue, R2Bucket } from './bindings.js';
import { D1MailFnStore } from './d1-store.js';
import { applyMailFnMigrations } from './migrations.js';
import { createCloudflareMailFn, createMailFnCloudflareHandlers, deriveCloudflareDeliveryId, type MailFnCloudflareEnv } from './worker.js';
import { D1WebhookReplayStore } from './webhook.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends MailFnCloudflareEnv {
    MAILFN_DB: D1Database;
    MAILFN_OBJECTS: R2Bucket;
    MAILFN_PARSE_QUEUE: Queue<ParseJob>;
    MAILFN_DOMAIN: string;
    MAILFN_SECRET_KEY: string;
  }
}

beforeEach(async () => {
  await applyMailFnMigrations(env.MAILFN_DB);
});

describe('MailFn in workerd', () => {
  it('runs the Worker fetch surface with real workerd bindings', async () => {
    const response = await SELF.fetch('https://mailfn.test/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { status: 'ok' } });
  });

  it('invokes Email and Queue handlers against real D1 and R2 storage', async () => {
    const jobs: ParseJob[] = [];
    const testEnv: MailFnCloudflareEnv = {
      ...env,
      MAILFN_PARSE_QUEUE: { async send(job) { jobs.push(job); } },
    };
    const mailfn = await createCloudflareMailFn(testEnv, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'workerd', displayName: 'Workerd' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const created = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id,
      kind: 'expiring',
      requestedLocalPart: 'runtime',
      expirySeconds: 3_600,
      idempotencyKey: 'workerd:runtime',
    });
    const raw = [
      'From: Sender <sender@example.com>',
      `To: ${created.inbox.address}`,
      'Subject: Runtime verification 481516',
      'Message-ID: <workerd-delivery@example.com>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="mailfn-boundary"',
      '',
      '--mailfn-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Your code is 481516',
      '--mailfn-boundary',
      'Content-Type: text/plain; name="proof.txt"',
      'Content-Disposition: attachment; filename="proof.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'ZXZpZGVuY2U=',
      '--mailfn-boundary--',
      '',
    ].join('\r\n');
    let rejected: string | undefined;
    await createMailFnCloudflareHandlers({ migrate: false }).email({
      from: 'sender@example.com',
      to: created.inbox.address,
      headers: new Headers({ 'message-id': '<workerd-delivery@example.com>', subject: 'Runtime verification 481516' }),
      raw: new Blob([raw]).stream(),
      rawSize: new TextEncoder().encode(raw).byteLength,
      setReject(reason) { rejected = reason; },
    }, testEnv, { waitUntil() {} });
    expect(rejected).toBeUndefined();
    expect(jobs).toHaveLength(1);

    const store = new D1MailFnStore(env.MAILFN_DB);
    expect(await store.listAudits(bootstrap.project.id)).toContainEqual(expect.objectContaining({
      action: 'project.created', resourceId: bootstrap.project.id,
    }));
    const pending = await store.getMessageByDelivery(
      created.inbox.id,
      await deriveCloudflareDeliveryId('sender@example.com', created.inbox.address, new TextEncoder().encode(raw)),
    );
    expect(pending).toMatchObject({ status: 'pending' });
    expect(await env.MAILFN_OBJECTS.get(pending!.rawObjectKey)).not.toBeNull();

    const batch = createMessageBatch('mailfn-parse', [{
      id: 'queue-message-1',
      timestamp: new Date(),
      body: jobs[0]!,
      attempts: 1,
    }]);
    const ctx = createExecutionContext();
    await createMailFnCloudflareHandlers({ migrate: false }).queue(batch as never, env, ctx as never);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toContain('queue-message-1');
    const parsed = await store.getMessage(pending!.id);
    expect(parsed).toMatchObject({ status: 'ready', subject: 'Runtime verification 481516' });
    expect(await store.listAttachments(pending!.id)).toMatchObject([{ filename: 'proof.txt', sizeBytes: 8 }]);
    await Promise.all([
      store.markMessageRead(pending!.id, '2026-08-10T00:00:02.000Z'),
      store.setMessageLabels(pending!.id, ['important'], '2026-08-10T00:00:02.000Z'),
    ]);
    expect(await store.getMessage(pending!.id)).toMatchObject({
      readAt: '2026-08-10T00:00:02.000Z', labels: ['important'],
    });
    const [thread] = await store.listThreads(bootstrap.project.id, created.inbox.id);
    expect(thread?.messageIds).toEqual([pending!.id]);
    await expect(store.deleteMessageWithThread(pending!.id, thread!, null)).resolves.toBe(true);
    await expect(store.getMessage(pending!.id)).resolves.toBeNull();
    await expect(store.getThread(thread!.id)).resolves.toBeNull();
  });

  it('atomically blocks inbound message creation once an inbox is quiesced', async () => {
    const testEnv: MailFnCloudflareEnv = { ...env, MAILFN_PARSE_QUEUE: { async send() {} } };
    const mailfn = await createCloudflareMailFn(testEnv, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'quiesce-workerd', displayName: 'Quiesce Workerd' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const created = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'quiesce', expirySeconds: 3_600,
    });
    const body = new TextEncoder().encode('Subject: quiesce\r\n\r\nbody');
    const accepted = await mailfn.receiveInbound({
      providerDeliveryId: 'quiesce-accepted', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: body, rawSize: body.byteLength,
    });
    const store = new D1MailFnStore(env.MAILFN_DB);
    await store.saveInbox({ ...created.inbox, status: 'deleting', updatedAt: new Date().toISOString() });
    await expect(store.createInboundMessageIfInboxActive({
      ...accepted,
      id: 'msg_quiesce_blocked',
      providerDeliveryId: 'quiesce-blocked',
      rawObjectKey: 'blocked/raw.eml',
    })).resolves.toBe(false);
    await expect(store.getMessage('msg_quiesce_blocked')).resolves.toBeNull();
  });

  it('deduplicates Message-ID-less retries and preserves distinct mail that reuses Message-ID', async () => {
    const testEnv: MailFnCloudflareEnv = {
      ...env,
      MAILFN_PARSE_QUEUE: { async send() {} },
    };
    const mailfn = await createCloudflareMailFn(testEnv, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'delivery-identity-workerd', displayName: 'Delivery Identity' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const created = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'delivery-identity', expirySeconds: 3_600,
    });
    const handler = createMailFnCloudflareHandlers({ migrate: false });
    const deliver = async (raw: string, messageId?: string) => handler.email({
      from: 'sender@example.com',
      to: created.inbox.address,
      headers: new Headers(messageId ? { 'message-id': messageId } : {}),
      raw: new Blob([raw]).stream(),
      rawSize: new TextEncoder().encode(raw).byteLength,
      setReject(reason) { throw new Error(`Unexpected rejection: ${reason}`); },
    }, testEnv, { waitUntil() {} });

    const withoutMessageId = 'From: sender@example.com\r\nSubject: retry\r\n\r\nsame evidence';
    await deliver(withoutMessageId);
    await deliver(withoutMessageId);
    expect(await new D1MailFnStore(env.MAILFN_DB).listMessages(bootstrap.project.id, created.inbox.id)).toHaveLength(1);

    await deliver('Message-ID: <shared@example.com>\r\nSubject: first\r\n\r\nfirst body', '<shared@example.com>');
    await deliver('Message-ID: <shared@example.com>\r\nSubject: second\r\n\r\nsecond body', '<shared@example.com>');
    const store = new D1MailFnStore(env.MAILFN_DB);
    expect(await store.listMessages(bootstrap.project.id, created.inbox.id)).toHaveLength(3);
    const firstPage = await store.listMessagesPage(bootstrap.project.id, created.inbox.id, {}, undefined, 2);
    const secondPage = await store.listMessagesPage(
      bootstrap.project.id, created.inbox.id, {}, firstPage.items.at(-1)!.id, 2,
    );
    expect(firstPage).toMatchObject({ hasMore: true, cursorFound: true, items: expect.any(Array) });
    expect(secondPage).toMatchObject({ hasMore: false, cursorFound: true, items: [expect.any(Object)] });
  });

  it('uses D1 batch atomicity for concurrent idempotent inbox creation', async () => {
    const mailfn = await createCloudflareMailFn(env, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'atomic-workerd', displayName: 'Atomic Workerd' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const input = {
      projectId: bootstrap.project.id,
      kind: 'expiring' as const,
      requestedLocalPart: 'atomic',
      expirySeconds: 3_600,
      idempotencyKey: 'workerd:atomic',
    };
    const results = await Promise.all([mailfn.createInbox(admin, input), mailfn.createInbox(admin, input)]);
    expect(results[0].inbox.id).toBe(results[1].inbox.id);
    expect(await new D1MailFnStore(env.MAILFN_DB).listInboxes(bootstrap.project.id)).toHaveLength(1);
  });

  it('enforces the active-inbox quota atomically in D1', async () => {
    const mailfn = await createCloudflareMailFn(env, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({
      slug: 'inbox-quota-workerd',
      displayName: 'Inbox Quota Workerd',
      quota: { maxActiveInboxes: 1 },
    });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const results = await Promise.allSettled(['quota-inbox-a', 'quota-inbox-b'].map((requestedLocalPart) => mailfn.createInbox(admin, {
      projectId: bootstrap.project.id,
      kind: 'expiring',
      requestedLocalPart,
      expirySeconds: 3_600,
    })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect(await new D1MailFnStore(env.MAILFN_DB).listInboxes(bootstrap.project.id)).toHaveLength(1);
  });

  it('enforces the active-inbox quota during concurrent D1 reactivation', async () => {
    const mailfn = await createCloudflareMailFn(env, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({
      slug: 'inbox-reactivation-workerd', displayName: 'Inbox Reactivation Workerd', quota: { maxActiveInboxes: 1 },
    });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const first = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'reactivate-a', expirySeconds: 3_600,
    });
    await mailfn.updateInbox(admin, first.inbox.id, { status: 'disabled' });
    const second = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'reactivate-b', expirySeconds: 3_600,
    });
    await mailfn.updateInbox(admin, second.inbox.id, { status: 'disabled' });

    const results = await Promise.allSettled([
      mailfn.updateInbox(admin, first.inbox.id, { status: 'active' }),
      mailfn.updateInbox(admin, second.inbox.id, { status: 'active' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect((await new D1MailFnStore(env.MAILFN_DB).listInboxes(bootstrap.project.id))
      .filter((inbox) => inbox.status === 'active')).toHaveLength(1);
  });

  it('erases D1 drafts when deleting their inbox', async () => {
    const mailfn = await createCloudflareMailFn(env, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'draft-erasure-workerd', displayName: 'Draft Erasure Workerd' });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const created = await mailfn.createInbox(admin, {
      projectId: bootstrap.project.id, kind: 'expiring', requestedLocalPart: 'draft-erasure', expirySeconds: 3_600,
    });
    const draft = await mailfn.createDraft(admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Erase me', text: 'sensitive body',
    });
    await expect(mailfn.deleteInbox(admin, created.inbox.id)).resolves.toMatchObject({ status: 'deleted' });
    const store = new D1MailFnStore(env.MAILFN_DB);
    await expect(store.getDraft(draft.id)).resolves.toBeNull();
    await expect(store.listDrafts(bootstrap.project.id, created.inbox.id)).resolves.toHaveLength(0);
  });

  it('atomically rejects a repeated webhook delivery identifier in D1', async () => {
    const replayStore = new D1WebhookReplayStore(env.MAILFN_DB);
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    await expect(replayStore.consume('workerd-delivery-once', expiresAt)).resolves.toBe(true);
    await expect(replayStore.consume('workerd-delivery-once', expiresAt)).resolves.toBe(false);
  });

  it('enforces the project ingress counter atomically across D1 inboxes', async () => {
    const testEnv: MailFnCloudflareEnv = {
      ...env,
      MAILFN_PARSE_QUEUE: { async send() {} },
    };
    const mailfn = await createCloudflareMailFn(testEnv, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({
      slug: 'quota-workerd',
      displayName: 'Quota Workerd',
      quota: { maxMessagesPerHour: 1, maxMessagesPerInboxPerHour: 10, maxMessagesPerSenderPerHour: 10 },
    });
    const admin = await mailfn.authenticate(bootstrap.credential.token);
    const [first, second] = await Promise.all(['quota-a', 'quota-b'].map((requestedLocalPart) => mailfn.createInbox(admin, {
      projectId: bootstrap.project.id,
      kind: 'expiring',
      requestedLocalPart,
      expirySeconds: 3_600,
    })));
    const body = new TextEncoder().encode('Subject: quota\r\n\r\nbody');
    const results = await Promise.allSettled([
      mailfn.receiveInbound({
        providerDeliveryId: 'quota-delivery-a', envelopeFrom: 'one@example.com', envelopeTo: first.inbox.address,
        raw: body, rawSize: body.byteLength,
      }),
      mailfn.receiveInbound({
        providerDeliveryId: 'quota-delivery-b', envelopeFrom: 'two@example.com', envelopeTo: second.inbox.address,
        raw: body, rawSize: body.byteLength,
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_RATE_LIMITED', details: { dimension: 'project' } },
    }]);
  });

  it('ages completed hourly ingress reservations before accepting a new bucket', async () => {
    const store = new D1MailFnStore(env.MAILFN_DB);
    const base = {
      projectId: 'quota-aging-project', inboxId: 'quota-aging-inbox', sender: 'sender@example.com',
      projectLimit: 10, inboxLimit: 10, senderLimit: 10,
    };
    await expect(store.reserveIngressQuota({
      ...base, id: 'old-reservation', bucket: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-10T00:01:00.000Z',
    })).resolves.toEqual({ allowed: true });
    await expect(store.reserveIngressQuota({
      ...base, id: 'current-reservation', bucket: '2026-08-10T01:00:00.000Z', createdAt: '2026-08-10T01:01:00.000Z',
    })).resolves.toEqual({ allowed: true });
    const count = await env.MAILFN_DB.prepare('SELECT COUNT(*) AS total FROM mailfn_ingress_reservations WHERE project_id = ?')
      .bind(base.projectId).first<{ total: number }>();
    expect(Number(count?.total)).toBe(1);
  });
});
