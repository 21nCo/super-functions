import type { D1Database } from './bindings.js';

export const MAILFN_D1_SCHEMA_VERSION = 3;

export const MAILFN_D1_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS mailfn_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_projects (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, status TEXT NOT NULL,
    default_retention_policy TEXT NOT NULL, data_region TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_inboxes (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, address TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, status TEXT NOT NULL,
    expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES mailfn_projects(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_inboxes_project_status ON mailfn_inboxes(project_id, status)`,
  `CREATE TABLE IF NOT EXISTS mailfn_credentials (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT, token_hash TEXT NOT NULL, token_prefix TEXT NOT NULL,
    permissions TEXT NOT NULL, status TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL, data_json TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES mailfn_projects(id) ON DELETE CASCADE,
    FOREIGN KEY(inbox_id) REFERENCES mailfn_inboxes(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_credentials_scope ON mailfn_credentials(project_id, inbox_id, status)`,
  `CREATE TABLE IF NOT EXISTS mailfn_messages (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT NOT NULL, provider_delivery_id TEXT NOT NULL,
    internet_message_id TEXT, envelope_from TEXT NOT NULL, envelope_to TEXT NOT NULL, subject TEXT NOT NULL,
    received_at TEXT NOT NULL, parsed_at TEXT, raw_object_key TEXT NOT NULL, raw_retention_expires_at TEXT NOT NULL,
    attachment_retention_expires_at TEXT NOT NULL, raw_deleted_at TEXT, thread_id TEXT, size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL, retention_expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL,
    UNIQUE(inbox_id, provider_delivery_id),
    FOREIGN KEY(project_id) REFERENCES mailfn_projects(id) ON DELETE CASCADE,
    FOREIGN KEY(inbox_id) REFERENCES mailfn_inboxes(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_messages_inbox_received ON mailfn_messages(project_id, inbox_id, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS mailfn_messages_retention ON mailfn_messages(retention_expires_at, status)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS mailfn_messages_fts USING fts5(
    message_id UNINDEXED, project_id UNINDEXED, inbox_id UNINDEXED, subject, text_body, html_body,
    tokenize = 'unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_attachments (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT NOT NULL, message_id TEXT NOT NULL,
    filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, object_key TEXT NOT NULL,
    sha256 TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL,
    FOREIGN KEY(message_id) REFERENCES mailfn_messages(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_attachments_message ON mailfn_attachments(message_id)`,
  `CREATE TABLE IF NOT EXISTS mailfn_threads (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT NOT NULL, normalized_subject TEXT NOT NULL,
    last_message_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_threads_inbox ON mailfn_threads(project_id, inbox_id, last_message_at DESC)`,
  `CREATE TABLE IF NOT EXISTS mailfn_webhooks (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT, url TEXT NOT NULL, event_types TEXT NOT NULL,
    secret_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_webhook_deliveries (
    id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL, event_id TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
    next_attempt_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_webhook_deliveries_webhook_created ON mailfn_webhook_deliveries(webhook_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS mailfn_drafts (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT NOT NULL, thread_id TEXT, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_domains (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT NOT NULL, status TEXT NOT NULL, verification_token TEXT NOT NULL,
    verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL,
    UNIQUE(domain)
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_domain_conflicts (
    domain_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT NOT NULL,
    resolved_owner_domain_id TEXT NOT NULL, detected_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO mailfn_domain_conflicts(
    domain_id, project_id, domain, resolved_owner_domain_id, detected_at, data_json
  )
  SELECT losing.id, losing.project_id, losing.domain,
    (SELECT owner.id FROM mailfn_domains AS owner
      WHERE owner.domain = losing.domain
      ORDER BY owner.created_at ASC, owner.id ASC LIMIT 1),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), losing.data_json
  FROM mailfn_domains AS losing
  WHERE losing.id <> (
    SELECT owner.id FROM mailfn_domains AS owner
    WHERE owner.domain = losing.domain
    ORDER BY owner.created_at ASC, owner.id ASC LIMIT 1
  )`,
  `UPDATE mailfn_inboxes
   SET status = 'deleting',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       data_json = json_set(
         data_json,
         '$.status', 'deleting',
         '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       )
   WHERE EXISTS (
     SELECT 1 FROM mailfn_domain_conflicts AS conflict
     WHERE conflict.project_id = mailfn_inboxes.project_id
       AND lower(substr(mailfn_inboxes.address, instr(mailfn_inboxes.address, '@') + 1)) = lower(conflict.domain)
   )`,
  `UPDATE mailfn_credentials
   SET status = 'revoked',
       revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       data_json = json_set(
         data_json,
         '$.status', 'revoked',
         '$.revokedAt', COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       )
   WHERE inbox_id IN (
     SELECT inbox.id FROM mailfn_inboxes AS inbox
     WHERE EXISTS (
       SELECT 1 FROM mailfn_domain_conflicts AS conflict
       WHERE conflict.project_id = inbox.project_id
         AND lower(substr(inbox.address, instr(inbox.address, '@') + 1)) = lower(conflict.domain)
     )
   ) AND status = 'active'`,
  `DELETE FROM mailfn_domains
   WHERE id IN (SELECT domain_id FROM mailfn_domain_conflicts)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mailfn_domains_domain_unique ON mailfn_domains(domain)`,
  `CREATE TABLE IF NOT EXISTS mailfn_events (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT, message_id TEXT, type TEXT NOT NULL,
    version INTEGER NOT NULL, occurred_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_events_project_time ON mailfn_events(project_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS mailfn_audits (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL,
    action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, created_at TEXT NOT NULL,
    retention_expires_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_audits_project_time ON mailfn_audits(project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS mailfn_audits_retention ON mailfn_audits(project_id, retention_expires_at)`,
  `CREATE TABLE IF NOT EXISTS mailfn_idempotency (
    project_id TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, resource_id TEXT NOT NULL,
    request_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL,
    PRIMARY KEY(project_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_usage (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, metric TEXT NOT NULL, quantity INTEGER NOT NULL,
    period TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_usage_project_period ON mailfn_usage(project_id, period, metric)`,
  `CREATE TABLE IF NOT EXISTS mailfn_ingress_reservations (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inbox_id TEXT NOT NULL, sender TEXT NOT NULL,
    bucket TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_ingress_project_bucket ON mailfn_ingress_reservations(project_id, bucket)`,
  `CREATE INDEX IF NOT EXISTS mailfn_ingress_inbox_bucket ON mailfn_ingress_reservations(project_id, inbox_id, bucket)`,
  `CREATE INDEX IF NOT EXISTS mailfn_ingress_sender_bucket ON mailfn_ingress_reservations(project_id, sender, bucket)`,
  `CREATE INDEX IF NOT EXISTS mailfn_ingress_bucket_cleanup ON mailfn_ingress_reservations(bucket)`,
  `CREATE TABLE IF NOT EXISTS mailfn_storage_reservations (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes >= 0), created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_storage_project ON mailfn_storage_reservations(project_id)`,
  `CREATE TABLE IF NOT EXISTS mailfn_webhook_replays (
    delivery_id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_webhook_replays_expiry ON mailfn_webhook_replays(expires_at)`,
  `CREATE TABLE IF NOT EXISTS mailfn_abuse_cases (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
    resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_sender_reputation (
    project_id TEXT NOT NULL, sender TEXT NOT NULL, status TEXT NOT NULL, score INTEGER NOT NULL CHECK(score >= 0 AND score <= 100),
    complaint_count INTEGER NOT NULL, bounce_count INTEGER NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL,
    PRIMARY KEY(project_id, sender)
  )`,
  `CREATE INDEX IF NOT EXISTS mailfn_sender_reputation_status ON mailfn_sender_reputation(project_id, status, score)`,
  `CREATE TABLE IF NOT EXISTS mailfn_support_cases (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mailfn_compliance (
    project_id TEXT PRIMARY KEY, data_region TEXT NOT NULL, retention_locked INTEGER NOT NULL,
    deletion_sla_hours INTEGER NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  )`,
  `UPDATE mailfn_messages
   SET thread_id = (
         SELECT winner.id
         FROM mailfn_threads AS losing
         JOIN mailfn_threads AS winner
           ON winner.project_id = losing.project_id
          AND winner.inbox_id = losing.inbox_id
          AND winner.normalized_subject = losing.normalized_subject
         WHERE losing.id = mailfn_messages.thread_id
         ORDER BY winner.created_at ASC, winner.id ASC
         LIMIT 1
       ),
       data_json = json_set(data_json, '$.threadId', (
         SELECT winner.id
         FROM mailfn_threads AS losing
         JOIN mailfn_threads AS winner
           ON winner.project_id = losing.project_id
          AND winner.inbox_id = losing.inbox_id
          AND winner.normalized_subject = losing.normalized_subject
         WHERE losing.id = mailfn_messages.thread_id
         ORDER BY winner.created_at ASC, winner.id ASC
         LIMIT 1
       ))
   WHERE thread_id IN (
     SELECT losing.id FROM mailfn_threads AS losing
     WHERE EXISTS (
       SELECT 1 FROM mailfn_threads AS winner
       WHERE winner.project_id = losing.project_id
         AND winner.inbox_id = losing.inbox_id
         AND winner.normalized_subject = losing.normalized_subject
         AND (winner.created_at < losing.created_at OR (winner.created_at = losing.created_at AND winner.id < losing.id))
     )
   )`,
  `UPDATE mailfn_drafts
   SET thread_id = (
         SELECT winner.id
         FROM mailfn_threads AS losing
         JOIN mailfn_threads AS winner
           ON winner.project_id = losing.project_id
          AND winner.inbox_id = losing.inbox_id
          AND winner.normalized_subject = losing.normalized_subject
         WHERE losing.id = mailfn_drafts.thread_id
         ORDER BY winner.created_at ASC, winner.id ASC
         LIMIT 1
       ),
       data_json = json_set(data_json, '$.threadId', (
         SELECT winner.id
         FROM mailfn_threads AS losing
         JOIN mailfn_threads AS winner
           ON winner.project_id = losing.project_id
          AND winner.inbox_id = losing.inbox_id
          AND winner.normalized_subject = losing.normalized_subject
         WHERE losing.id = mailfn_drafts.thread_id
         ORDER BY winner.created_at ASC, winner.id ASC
         LIMIT 1
       ))
   WHERE thread_id IN (
     SELECT losing.id FROM mailfn_threads AS losing
     WHERE EXISTS (
       SELECT 1 FROM mailfn_threads AS winner
       WHERE winner.project_id = losing.project_id
         AND winner.inbox_id = losing.inbox_id
         AND winner.normalized_subject = losing.normalized_subject
         AND (winner.created_at < losing.created_at OR (winner.created_at = losing.created_at AND winner.id < losing.id))
     )
   )`,
  `UPDATE mailfn_threads AS thread
   SET last_message_at = COALESCE(
         (SELECT MAX(message.received_at) FROM mailfn_messages AS message WHERE message.thread_id = thread.id),
         thread.last_message_at
       ),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       data_json = json_set(
         data_json,
         '$.messageIds', json(COALESCE((
           SELECT json_group_array(ordered.id)
           FROM (
             SELECT message.id FROM mailfn_messages AS message
             WHERE message.thread_id = thread.id
             ORDER BY message.received_at ASC, message.id ASC
           ) AS ordered
         ), '[]')),
         '$.lastMessageAt', COALESCE(
           (SELECT MAX(message.received_at) FROM mailfn_messages AS message WHERE message.thread_id = thread.id),
           thread.last_message_at
         ),
         '$.participants', json(COALESCE((
           SELECT json_group_array(ordered.value)
           FROM (
             SELECT DISTINCT participant.value AS value
             FROM mailfn_threads AS member, json_each(member.data_json, '$.participants') AS participant
             WHERE member.project_id = thread.project_id
               AND member.inbox_id = thread.inbox_id
               AND member.normalized_subject = thread.normalized_subject
             ORDER BY participant.value
           ) AS ordered
         ), '[]')),
         '$.labels', json(COALESCE((
           SELECT json_group_array(ordered.value)
           FROM (
             SELECT DISTINCT label.value AS value
             FROM mailfn_threads AS member, json_each(member.data_json, '$.labels') AS label
             WHERE member.project_id = thread.project_id
               AND member.inbox_id = thread.inbox_id
               AND member.normalized_subject = thread.normalized_subject
             ORDER BY label.value
           ) AS ordered
         ), '[]')),
         '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       )
   WHERE EXISTS (SELECT 1 FROM mailfn_messages AS message WHERE message.thread_id = thread.id)
      OR EXISTS (
        SELECT 1 FROM mailfn_threads AS member
        WHERE member.id <> thread.id
          AND member.project_id = thread.project_id
          AND member.inbox_id = thread.inbox_id
          AND member.normalized_subject = thread.normalized_subject
      )`,
  `DELETE FROM mailfn_threads AS losing
   WHERE EXISTS (
     SELECT 1 FROM mailfn_threads AS winner
     WHERE winner.project_id = losing.project_id
       AND winner.inbox_id = losing.inbox_id
       AND winner.normalized_subject = losing.normalized_subject
       AND (winner.created_at < losing.created_at OR (winner.created_at = losing.created_at AND winner.id < losing.id))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mailfn_threads_subject ON mailfn_threads(project_id, inbox_id, normalized_subject)`,
] as const;

export async function applyMailFnMigrations(database: D1Database): Promise<void> {
  await database.prepare('PRAGMA foreign_keys = ON').run();
  await database.prepare(MAILFN_D1_MIGRATIONS[0]).run();
  const applied = await database.prepare('SELECT version FROM mailfn_schema_migrations WHERE version = ?').bind(MAILFN_D1_SCHEMA_VERSION).first();
  if (applied) return;
  await database.batch([
    ...MAILFN_D1_MIGRATIONS.slice(1).map((statement) => database.prepare(statement)),
    database
      .prepare('INSERT OR IGNORE INTO mailfn_schema_migrations(version, applied_at) VALUES (?, ?)')
      .bind(MAILFN_D1_SCHEMA_VERSION, new Date().toISOString()),
  ]);
}
