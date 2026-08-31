import { describe, expect, it } from 'vitest';

import type { AuditEvent, ComplianceProfile, Credential, Inbox, MailDomain, Message, Webhook } from '@mailfn/core';

import type { D1Database, D1PreparedStatement, D1Result } from './bindings.js';
import { D1MailFnStore } from './d1-store.js';

class RecordingStatement implements D1PreparedStatement {
  public values: unknown[] = [];

  public constructor(public readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> { return null; }
  async all<T>(): Promise<D1Result<T>> { return { success: true, results: [] }; }
  async run<T>(): Promise<D1Result<T>> { return { success: true, results: [], meta: { changes: 1 } }; }
}

class RecordingDatabase implements D1Database {
  public readonly statements: RecordingStatement[] = [];

  prepare(query: string): D1PreparedStatement {
    const statement = new RecordingStatement(query);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>> {
    return statements.map(() => ({ success: true, results: [], meta: { changes: 1 } }));
  }
  async exec(): Promise<{ count: number; duration: number }> { return { count: 0, duration: 0 }; }
}

describe('D1MailFnStore', () => {
  it('inserts inbox credentials only while the owning inbox is active and unexpired', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const credential = {
      id: 'cred_1', projectId: 'prj_1', inboxId: 'inb_1', tokenHash: 'hash',
      tokenPrefix: 'mfn_cred_1', permissions: ['inbox:read'], status: 'active',
      createdAt: '2026-08-30T00:00:00.000Z',
    } satisfies Credential;

    await expect(store.saveCredentialIfInboxActive(
      credential,
      '2026-08-30T00:00:01.000Z',
    )).resolves.toBe(true);

    expect(database.statements[0]?.query).toContain('FROM mailfn_inboxes');
    expect(database.statements[0]?.query).toContain("status = 'active'");
    expect(database.statements[0]?.query).toContain('julianday(expires_at) > julianday(?)');
    expect(database.statements[0]?.values.slice(-3)).toEqual([
      'inb_1', 'prj_1', '2026-08-30T00:00:01.000Z',
    ]);
  });

  it('pages project messages in the database with the complete admin query', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);

    await store.listProjectMessagesPage('prj_1', {
      offset: 50,
      limit: 25,
      search: 'needle',
      filter: { status: 'ready' },
      sort: [{ field: 'receivedAt', direction: 'desc' }],
    });

    expect(database.statements[0]?.query).toContain('mailfn_messages.project_id = ?');
    expect(database.statements[0]?.query).toContain("admin_inbox.status = 'deleted'");
    expect(database.statements[0]?.query).toContain('mailfn_messages.status = ?');
    expect(database.statements[0]?.query).toContain('ORDER BY julianday(mailfn_messages.received_at) DESC');
    expect(database.statements[0]?.query).toContain('LIMIT ? OFFSET ?');
    expect(database.statements[0]?.values).toEqual([
      'prj_1', 'needle', 'ready', 26, 50,
    ]);
  });

  it('sorts project attachments by timestamp instant in D1', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);

    await store.listProjectAttachmentsPage('prj_1', {
      offset: 0,
      limit: 25,
      sort: [{ field: 'createdAt', direction: 'desc' }],
    });

    expect(database.statements[0]?.query).toContain('ORDER BY julianday(mailfn_attachments.created_at) DESC');
  });

  it('keeps inbox-scoped webhook queries separate from project-wide webhooks', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    await store.listWebhooks('prj_1', 'inb_1');
    expect(database.statements[0]?.query).toContain('project_id = ? AND inbox_id = ?');
    expect(database.statements[0]?.query).not.toContain('inbox_id IS NULL');
    expect(database.statements[0]?.values).toEqual(['prj_1', 'inb_1']);
  });

  it('binds every durable message column including independent retention clocks', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const message = {
      id: 'msg_1', projectId: 'prj_1', inboxId: 'inb_1', providerDeliveryId: 'delivery_1',
      internetMessageId: '<message@example.com>', envelopeFrom: 'sender@example.com', envelopeTo: 'target@example.com',
      from: [{ address: 'sender@example.com' }], to: [{ address: 'target@example.com' }], cc: [], bcc: [], replyTo: [],
      subject: 'Subject', receivedAt: '2026-08-10T00:00:00.000Z', parsedAt: '2026-08-10T00:00:01.000Z',
      headers: {}, rawObjectKey: 'raw/key', rawRetentionExpiresAt: '2026-08-11T00:00:00.000Z',
      attachmentRetentionExpiresAt: '2026-08-12T00:00:00.000Z', references: [], authenticationResults: {},
      sizeBytes: 42, status: 'ready', labels: [], retentionExpiresAt: '2026-09-10T00:00:00.000Z',
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:01.000Z',
    } satisfies Message;

    await store.saveMessage(message);

    const statement = database.statements[0]!;
    const insert = statement.query.slice(0, statement.query.indexOf('ON CONFLICT'));
    expect(insert.match(/\?/g)).toHaveLength(21);
    expect(statement.values).toHaveLength(21);
    expect(statement.query).toContain('raw_retention_expires_at');
    expect(statement.query).toContain('attachment_retention_expires_at');
    expect(JSON.parse(String(statement.values.at(-1)))).toEqual(message);
  });

  it('guards webhook creation with the active project quota in one statement', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const now = '2026-08-30T00:00:00.000Z';
    await store.createWebhookWithQuota({
      id: 'whk_1', projectId: 'prj_1', url: 'https://example.test/hook', eventTypes: ['message.received'],
      secretHash: 'hash', status: 'active', consecutiveFailures: 0, createdAt: now, updatedAt: now,
    } as Webhook, 3);

    expect(database.statements[0]?.query).toContain("SELECT COUNT(*) FROM mailfn_webhooks WHERE project_id = ? AND status = 'active'");
    expect(database.statements[0]?.values.slice(-2)).toEqual(['prj_1', 3]);
  });

  it('creates a webhook and its audit in one conditional D1 batch', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const now = '2026-08-30T00:00:00.000Z';
    const webhook = {
      id: 'whk_atomic', projectId: 'prj_1', url: 'https://example.test/hook', eventTypes: ['message.received'],
      secretHash: 'hash', status: 'active', consecutiveFailures: 0, createdAt: now, updatedAt: now,
    } satisfies Webhook;
    const audit = {
      id: 'aud_atomic', projectId: 'prj_1', actorType: 'admin', actorId: 'admin', action: 'webhook.created',
      resourceType: 'webhook', resourceId: webhook.id, metadata: {}, createdAt: now,
      retentionExpiresAt: '2027-08-30T00:00:00.000Z',
    } satisfies AuditEvent;

    await expect(store.createWebhookWithQuotaAndAudit(webhook, 3, audit)).resolves.toBe(true);

    expect(database.statements[0]?.query).toContain('SELECT COUNT(*) FROM mailfn_webhooks');
    expect(database.statements[1]?.query).toContain('WHERE changes() = 1 AND EXISTS');
    expect(database.statements[1]?.values.at(-1)).toBe(webhook.id);
  });

  it('uses opposing D1 guards for retention locks and deletion claims', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const inbox = {
      id: 'inb_1', projectId: 'prj_1', address: 'one@example.test', kind: 'stable', status: 'active',
      metadata: {}, labels: [], createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
    } satisfies Inbox;
    const deleting = { ...inbox, status: 'deleting' as const, updatedAt: '2026-08-30T00:00:01.000Z' };
    const compliance = {
      projectId: 'prj_1', dataRegion: 'global', retentionLocked: true, exportEnabled: false,
      deletionSlaHours: 24, updatedAt: '2026-08-30T00:00:01.000Z',
    } satisfies ComplianceProfile;

    await expect(store.claimInboxDeletion(deleting, inbox)).resolves.toBe(true);
    await expect(store.saveComplianceProfileIfNoDeletion(compliance)).resolves.toBe(true);

    expect(database.statements[0]?.query).toContain('mailfn_compliance');
    expect(database.statements[0]?.query).toContain('retention_locked = 1');
    expect(database.statements[1]?.query).toContain("status = 'deleting'");
  });

  it('prunes only terminal webhook deliveries and events that are not needed for retries', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    await store.deleteTerminalWebhookDeliveriesBefore('prj_1', '2026-08-30T00:00:00.000Z');
    await store.deleteEventsBefore('prj_1', '2026-08-30T00:00:00.000Z');

    expect(database.statements[0]?.query).toContain("delivery.status = 'failed' AND webhook.status != 'active'");
    expect(database.statements[1]?.query).toContain("delivery.status IN ('pending', 'failed')");
  });

  it('atomically releases only old storage reservations without durable records', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);

    await store.releaseOrphanedStorageReservations(
      'prj_1',
      '2026-08-30T00:00:00.000Z',
      '2026-08-29T23:00:00.000Z',
    );

    expect(database.statements[0]?.query).toContain('DELETE FROM mailfn_storage_reservations');
    expect(database.statements[0]?.query).toContain('NOT EXISTS');
    expect(database.statements[0]?.query).toContain('mailfn_storage_claims.claimed_at > ?');
    expect(database.statements[0]?.query).toContain('mailfn_messages.id = mailfn_storage_reservations.id');
    expect(database.statements[0]?.query).toContain("json_extract(mailfn_attachments.data_json, '$.storageReservationId')");
    expect(database.statements[0]?.query).toContain('mailfn_attachments.id');
    expect(database.statements[0]?.values).toEqual([
      'prj_1',
      '2026-08-30T00:00:00.000Z',
      '2026-08-29T23:00:00.000Z',
    ]);
  });

  it('atomically claims an existing storage reservation before object writes', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);

    await expect(store.claimStorage('msg_1', '2026-08-30T00:00:00.000Z')).resolves.toBe(true);

    expect(database.statements[0]?.query).toContain('INSERT INTO mailfn_storage_claims');
    expect(database.statements[0]?.query).toContain('SELECT id, ? FROM mailfn_storage_reservations WHERE id = ?');
    expect(database.statements[0]?.values).toEqual(['2026-08-30T00:00:00.000Z', 'msg_1']);
  });

  it('compares received filters as normalized instants', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);

    await store.listMessages('prj_1', 'inb_1', {
      receivedAfter: '2026-08-30T05:30:00+05:30',
      receivedBefore: '2026-08-30T07:30:00+05:30',
    });

    expect(database.statements[0]?.query).toContain('julianday(received_at) > julianday(?)');
    expect(database.statements[0]?.query).toContain('julianday(received_at) < julianday(?)');
    expect(database.statements[0]?.values).toEqual([
      'prj_1', 'inb_1', '2026-08-30T00:00:00.000Z', '2026-08-30T02:00:00.000Z',
    ]);
  });

  it('guards domain creation with the project quota in one statement', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const now = '2026-08-30T00:00:00.000Z';
    await store.createDomainWithQuota({
      id: 'dom_1', projectId: 'prj_1', domain: 'mail.example.test', status: 'pending',
      verificationToken: 'verify', expectedRecords: [], createdAt: now, updatedAt: now,
    } satisfies MailDomain, 2);

    expect(database.statements[0]?.query).toContain('SELECT COUNT(*) FROM mailfn_domains WHERE project_id = ?');
    expect(database.statements[0]?.query).toContain('NOT EXISTS (SELECT 1 FROM mailfn_domains WHERE domain = ?)');
    expect(database.statements[0]?.values.slice(-3)).toEqual(['mail.example.test', 'prj_1', 2]);
  });

  it('claims domain verification with a compare-and-set update', async () => {
    const database = new RecordingDatabase();
    const store = new D1MailFnStore(database);
    const expected = {
      id: 'dom_1', projectId: 'prj_1', domain: 'mail.example.test', status: 'pending',
      verificationToken: 'verify', expectedRecords: [],
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
    } satisfies MailDomain;
    const claimed = {
      ...expected,
      status: 'verifying' as const,
      lastCheckedAt: '2026-08-30T00:00:01.000Z',
      updatedAt: '2026-08-30T00:00:01.000Z',
    };

    await expect(store.saveDomainIfUnchanged(claimed, expected)).resolves.toBe(true);

    expect(database.statements[0]?.query).toContain('UPDATE mailfn_domains');
    expect(database.statements[0]?.query).toContain('WHERE id = ? AND data_json = ?');
    expect(database.statements[0]?.values.slice(-2)).toEqual([
      'dom_1', JSON.stringify(expected),
    ]);
  });
});
