/// <reference types="@cloudflare/vitest-pool-workers" />

import {
  createExecutionContext,
  createMessageBatch,
  env,
  getQueueResult,
  SELF,
} from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { MailDomain, Message, ParseJob, Webhook } from '@mailfn/core';
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
  it('upgrades schema-v1 duplicate domains without blocking Worker startup', async () => {
    await env.MAILFN_DB.prepare('DROP TABLE IF EXISTS mailfn_domain_conflicts').run();
    await env.MAILFN_DB.prepare('DROP TABLE mailfn_domains').run();
    await env.MAILFN_DB.prepare(`CREATE TABLE mailfn_domains (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT NOT NULL, status TEXT NOT NULL,
      verification_token TEXT NOT NULL, verified_at TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(project_id, domain)
    )`).run();
    await env.MAILFN_DB.prepare('DELETE FROM mailfn_schema_migrations').run();
    await env.MAILFN_DB.prepare(
      'INSERT INTO mailfn_schema_migrations(version, applied_at) VALUES (1, ?)',
    ).bind('2026-08-29T00:00:00.000Z').run();
    for (const entry of [
      { id: 'dom_owner', projectId: 'prj_1', createdAt: '2026-08-29T00:00:00.000Z' },
      { id: 'dom_conflict', projectId: 'prj_2', createdAt: '2026-08-30T00:00:00.000Z' },
    ]) {
      await env.MAILFN_DB.prepare(`INSERT INTO mailfn_domains(
        id, project_id, domain, status, verification_token, created_at, updated_at, data_json
      ) VALUES (?, ?, ?, 'active', 'verify', ?, ?, ?)`)
        .bind(entry.id, entry.projectId, 'shared.example.com', entry.createdAt, entry.createdAt, JSON.stringify(entry))
        .run();
    }
    for (const projectId of ['prj_1', 'prj_2']) {
      await env.MAILFN_DB.prepare(`INSERT OR REPLACE INTO mailfn_projects(
        id, slug, display_name, status, default_retention_policy, data_region, created_at, updated_at, data_json
      ) VALUES (?, ?, ?, 'active', '{}', 'global', ?, ?, '{}')`)
        .bind(projectId, projectId, projectId, '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z')
        .run();
    }
    for (const inbox of [
      { id: 'inb_owner', projectId: 'prj_1', address: 'owner@shared.example.com' },
      { id: 'inb_conflict', projectId: 'prj_2', address: 'conflict@shared.example.com' },
    ]) {
      await env.MAILFN_DB.prepare(`INSERT OR REPLACE INTO mailfn_inboxes(
        id, project_id, address, kind, status, created_at, updated_at, data_json
      ) VALUES (?, ?, ?, 'stable', 'active', ?, ?, ?)`)
        .bind(
          inbox.id,
          inbox.projectId,
          inbox.address,
          '2026-08-29T00:00:00.000Z',
          '2026-08-29T00:00:00.000Z',
          JSON.stringify({ ...inbox, kind: 'stable', status: 'active' }),
        )
        .run();
    }

    await expect(applyMailFnMigrations(env.MAILFN_DB)).resolves.toBeUndefined();
    const domains = await env.MAILFN_DB.prepare(
      'SELECT id FROM mailfn_domains WHERE domain = ? ORDER BY id',
    ).bind('shared.example.com').all<{ id: string }>();
    expect(domains.results).toEqual([{ id: 'dom_owner' }]);
    await expect(env.MAILFN_DB.prepare(
      'SELECT resolved_owner_domain_id FROM mailfn_domain_conflicts WHERE domain_id = ?',
    ).bind('dom_conflict').first()).resolves.toEqual({ resolved_owner_domain_id: 'dom_owner' });
    await expect(env.MAILFN_DB.prepare(
      'SELECT version FROM mailfn_schema_migrations WHERE version = 2',
    ).first()).resolves.toEqual({ version: 2 });
    await expect(env.MAILFN_DB.prepare(
      'SELECT id, status FROM mailfn_inboxes WHERE id IN (?, ?) ORDER BY id',
    ).bind('inb_owner', 'inb_conflict').all()).resolves.toMatchObject({
      results: [
        { id: 'inb_conflict', status: 'deleted' },
        { id: 'inb_owner', status: 'active' },
      ],
    });

    const store = new D1MailFnStore(env.MAILFN_DB);
    const message = (id: string, projectId: string, inboxId: string, envelopeTo: string): Message => ({
      id, projectId, inboxId, providerDeliveryId: id, envelopeFrom: 'sender@example.com', envelopeTo,
      from: [{ address: 'sender@example.com' }], to: [{ address: envelopeTo }], cc: [], bcc: [], replyTo: [],
      subject: 'Migration delivery', receivedAt: '2026-08-30T00:00:00.000Z', headers: {}, rawObjectKey: `raw/${id}`,
      rawRetentionExpiresAt: '2026-09-01T00:00:00.000Z', attachmentRetentionExpiresAt: '2026-09-01T00:00:00.000Z',
      references: [], authenticationResults: {}, sizeBytes: 1, status: 'pending', labels: [],
      retentionExpiresAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
    });
    await expect(store.createInboundMessageIfInboxActive(message(
      'msg_owner', 'prj_1', 'inb_owner', 'owner@shared.example.com',
    ))).resolves.toBe(true);
    await expect(store.createInboundMessageIfInboxActive(message(
      'msg_conflict', 'prj_2', 'inb_conflict', 'conflict@shared.example.com',
    ))).resolves.toBe(false);
  });

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

  it('enforces the domain quota atomically in D1', async () => {
    const store = new D1MailFnStore(env.MAILFN_DB);
    const now = '2026-08-30T00:00:00.000Z';
    const domain = (id: string): MailDomain => ({
      id,
      projectId: 'project-domain-quota',
      domain: `${id}.example.test`,
      status: 'pending',
      verificationToken: `verify-${id}`,
      expectedRecords: [],
      createdAt: now,
      updatedAt: now,
    });

    const results = await Promise.all([
      store.createDomainWithQuota(domain('domain-a'), 1),
      store.createDomainWithQuota(domain('domain-b'), 1),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.listDomains('project-domain-quota')).toHaveLength(1);
  });

  it('enforces the active-webhook quota atomically in D1', async () => {
    const mailfn = await createCloudflareMailFn(env, { migrate: false });
    const bootstrap = await mailfn.bootstrapProject({ slug: 'webhook-quota-workerd', displayName: 'Webhook Quota Workerd' });
    const store = new D1MailFnStore(env.MAILFN_DB);
    const now = new Date().toISOString();
    const webhook = (id: string): Webhook => ({
      id, projectId: bootstrap.project.id, url: `https://${id}.example.test/hook`, eventTypes: ['message.received'],
      secretHash: `hash-${id}`, status: 'active', consecutiveFailures: 0, createdAt: now, updatedAt: now,
    });
    const results = await Promise.all([
      store.createWebhookWithQuota(webhook('whk_one'), 1),
      store.createWebhookWithQuota(webhook('whk_two'), 1),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.listWebhooks(bootstrap.project.id)).toHaveLength(1);
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
