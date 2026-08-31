import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { MAILFN_D1_MIGRATIONS, MAILFN_D1_SCHEMA_VERSION } from './migrations.js';

describe('MailFn D1 schema', () => {
  it('covers every durable domain and critical uniqueness/index boundary', () => {
    const sql = MAILFN_D1_MIGRATIONS.join('\n');
    for (const table of [
      'projects', 'inboxes', 'credentials', 'messages', 'attachments', 'threads', 'webhooks',
      'webhook_deliveries', 'drafts', 'domains', 'events', 'audits', 'idempotency', 'usage',
      'domain_conflicts',
      'abuse_cases', 'sender_reputation', 'support_cases', 'compliance',
      'ingress_reservations', 'storage_reservations', 'storage_claims', 'webhook_replays',
    ]) expect(sql).toContain(`mailfn_${table}`);
    expect(sql).toContain('UNIQUE(inbox_id, provider_delivery_id)');
    expect(sql).toContain('address TEXT NOT NULL UNIQUE');
    expect(sql).toContain('retention_expires_at');
    expect(sql).toContain('token_hash TEXT NOT NULL');
    expect(sql).toContain('mailfn_messages_fts USING fts5');
    expect(sql).toContain('mailfn_webhook_deliveries(webhook_id, created_at)');
    expect(sql).toContain('mailfn_threads_subject');
    expect(sql).toContain('resolved_owner_domain_id');
    expect(sql).toContain("SET status = 'deleting'");
    expect(sql).toContain("SET status = 'revoked'");
    expect(sql).toContain('conflict.project_id = mailfn_inboxes.project_id');
    expect(sql).toContain('DELETE FROM mailfn_domains');
    expect(MAILFN_D1_SCHEMA_VERSION).toBe(4);
  });

  it('keeps the checked-in bootstrap schema aligned with runtime migrations', async () => {
    const checkedIn = await readFile(new URL('../migrations/0001_mailfn.sql', import.meta.url), 'utf8');
    const runtime = MAILFN_D1_MIGRATIONS.join('\n');
    const schemaObjects = (sql: string): string[] => Array.from(sql.matchAll(
      /CREATE (?:VIRTUAL )?(?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS\s+([a-z0-9_]+)/gi,
    ), (match) => match[1]!).sort();

    expect(schemaObjects(checkedIn)).toEqual(schemaObjects(runtime));
    expect(checkedIn).toContain('FOREIGN KEY(id) REFERENCES mailfn_storage_reservations(id) ON DELETE CASCADE');
    expect(checkedIn).toContain(`VALUES (${MAILFN_D1_SCHEMA_VERSION}, CURRENT_TIMESTAMP);`);
  });
});
