import { describe, expect, it } from 'vitest';

import { MAILFN_D1_MIGRATIONS } from './migrations.js';

describe('MailFn D1 schema', () => {
  it('covers every durable domain and critical uniqueness/index boundary', () => {
    const sql = MAILFN_D1_MIGRATIONS.join('\n');
    for (const table of [
      'projects', 'inboxes', 'credentials', 'messages', 'attachments', 'threads', 'webhooks',
      'webhook_deliveries', 'drafts', 'domains', 'events', 'audits', 'idempotency', 'usage',
      'domain_conflicts',
      'abuse_cases', 'sender_reputation', 'support_cases', 'compliance',
      'ingress_reservations', 'storage_reservations', 'webhook_replays',
    ]) expect(sql).toContain(`mailfn_${table}`);
    expect(sql).toContain('UNIQUE(inbox_id, provider_delivery_id)');
    expect(sql).toContain('address TEXT NOT NULL UNIQUE');
    expect(sql).toContain('retention_expires_at');
    expect(sql).toContain('token_hash TEXT NOT NULL');
    expect(sql).toContain('mailfn_messages_fts USING fts5');
    expect(sql).toContain('mailfn_webhook_deliveries(webhook_id, created_at)');
    expect(sql).toContain('resolved_owner_domain_id');
    expect(sql).toContain('DELETE FROM mailfn_domains');
  });
});
