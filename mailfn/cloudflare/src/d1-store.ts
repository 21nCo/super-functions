import type {
  AbuseCase,
  Attachment,
  AuditEvent,
  ComplianceProfile,
  Credential,
  Draft,
  IdempotencyRecord,
  IngressQuotaDecision,
  IngressQuotaReservation,
  Inbox,
  MailDomain,
  MailFnEvent,
  MailFnStore,
  Message,
  MessageFilter,
  Project,
  SearchMessagesInput,
  SenderReputation,
  SupportCase,
  Thread,
  UsageRecord,
  Webhook,
  WebhookDelivery,
} from '@mailfn/core';

import type { D1Database, D1PreparedStatement } from './bindings.js';

interface JsonRow {
  data_json: string;
}

export class D1MailFnStore implements MailFnStore {
  public constructor(private readonly database: D1Database) {}

  async getProject(id: string): Promise<Project | null> {
    return this.one('SELECT data_json FROM mailfn_projects WHERE id = ?', [id]);
  }
  async getProjectBySlug(slug: string): Promise<Project | null> {
    return this.one('SELECT data_json FROM mailfn_projects WHERE slug = ?', [slug]);
  }
  async listProjects(): Promise<Project[]> {
    return this.many('SELECT data_json FROM mailfn_projects ORDER BY created_at', []);
  }
  async saveProject(value: Project): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_projects(id, slug, display_name, status, default_retention_policy, data_region, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, display_name=excluded.display_name, status=excluded.status,
       default_retention_policy=excluded.default_retention_policy, data_region=excluded.data_region, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.slug, value.displayName, value.status, JSON.stringify(value.defaultRetentionPolicy), value.dataRegion, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async createProjectWithCredential(project: Project, credential: Credential, audit: AuditEvent): Promise<void> {
    const results = await this.database.batch([
      bind(this.database.prepare(
        `INSERT INTO mailfn_projects(id, slug, display_name, status, default_retention_policy, data_region, created_at, updated_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ), [project.id, project.slug, project.displayName, project.status, JSON.stringify(project.defaultRetentionPolicy), project.dataRegion, project.createdAt, project.updatedAt, json(project)]),
      credentialInsert(this.database, credential),
      auditInsert(this.database, audit),
    ]);
    if (results.some((result) => !result.success)) throw new Error('MAILFN_D1_WRITE_FAILED');
  }

  async getInbox(id: string): Promise<Inbox | null> {
    return this.one('SELECT data_json FROM mailfn_inboxes WHERE id = ?', [id]);
  }
  async getInboxByAddress(address: string): Promise<Inbox | null> {
    return this.one('SELECT data_json FROM mailfn_inboxes WHERE address = ?', [address]);
  }
  async listInboxes(projectId: string): Promise<Inbox[]> {
    return this.many('SELECT data_json FROM mailfn_inboxes WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async saveInbox(value: Inbox): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_inboxes(id, project_id, address, kind, status, expires_at, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET address=excluded.address, kind=excluded.kind, status=excluded.status,
       expires_at=excluded.expires_at, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.address, value.kind, value.status, value.expiresAt ?? null, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async saveInboxWithActiveQuota(value: Inbox, maxActiveInboxes: number): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `UPDATE mailfn_inboxes
       SET address = ?, kind = ?, status = ?, expires_at = ?, updated_at = ?, data_json = ?
       WHERE id = ? AND project_id = ? AND status NOT IN ('deleting', 'deleted')
         AND (status = 'active' OR (
           SELECT COUNT(*) FROM mailfn_inboxes
           WHERE project_id = ? AND id <> ? AND status = 'active'
         ) < ?)`,
    ), [
      value.address, value.kind, value.status, value.expiresAt ?? null, value.updatedAt, json(value),
      value.id, value.projectId, value.projectId, value.id, maxActiveInboxes,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async createInboxWithCredential(
    inbox: Inbox,
    credential: Credential,
    idempotency: IdempotencyRecord | undefined,
    maxActiveInboxes: number,
  ): Promise<void> {
    const statements = [
      bind(this.database.prepare(
        `INSERT INTO mailfn_inboxes(id, project_id, address, kind, status, expires_at, created_at, updated_at, data_json)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM mailfn_inboxes WHERE project_id = ? AND status = 'active') < ?`,
      ), [
        inbox.id, inbox.projectId, inbox.address, inbox.kind, inbox.status, inbox.expiresAt ?? null,
        inbox.createdAt, inbox.updatedAt, json(inbox), inbox.projectId, maxActiveInboxes,
      ]),
      credentialInsert(this.database, credential),
    ];
    if (idempotency) {
      statements.push(bind(this.database.prepare(
        `INSERT INTO mailfn_idempotency(project_id, key, operation, resource_id, request_hash, expires_at, created_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ), [idempotency.projectId, idempotency.key, idempotency.operation, idempotency.resourceId, idempotency.requestHash, idempotency.expiresAt, idempotency.createdAt, json(idempotency)]));
    }
    const results = await this.database.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('MAILFN_D1_WRITE_FAILED');
  }

  async getCredential(id: string): Promise<Credential | null> {
    return this.one('SELECT data_json FROM mailfn_credentials WHERE id = ?', [id]);
  }
  async listCredentials(projectId: string, inboxId?: string): Promise<Credential[]> {
    return inboxId
      ? this.many('SELECT data_json FROM mailfn_credentials WHERE project_id = ? AND inbox_id = ? ORDER BY created_at', [projectId, inboxId])
      : this.many('SELECT data_json FROM mailfn_credentials WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async saveCredential(value: Credential): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_credentials(id, project_id, inbox_id, token_hash, token_prefix, permissions, status, expires_at, revoked_at, created_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, token_prefix=excluded.token_prefix, permissions=excluded.permissions,
       status=excluded.status, expires_at=excluded.expires_at, revoked_at=excluded.revoked_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.inboxId ?? null, value.tokenHash, value.tokenPrefix, JSON.stringify(value.permissions), value.status, value.expiresAt ?? null, value.revokedAt ?? null, value.createdAt, json(value)],
    );
  }
  async touchCredentialIfActive(id: string, lastUsedAt: string): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE mailfn_credentials
       SET data_json = json_set(data_json, '$.lastUsedAt', ?)
       WHERE id = ? AND status = 'active'`,
    ).bind(lastUsedAt, id).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }

  async getMessage(id: string): Promise<Message | null> {
    return this.one('SELECT data_json FROM mailfn_messages WHERE id = ?', [id]);
  }
  async getMessageByDelivery(inboxId: string, providerDeliveryId: string): Promise<Message | null> {
    return this.one('SELECT data_json FROM mailfn_messages WHERE inbox_id = ? AND provider_delivery_id = ?', [inboxId, providerDeliveryId]);
  }
  async listMessages(projectId: string, inboxId: string, filter: MessageFilter = {}): Promise<Message[]> {
    const clauses = ['project_id = ?', 'inbox_id = ?'];
    const values: unknown[] = [projectId, inboxId];
    if (filter.receivedAfter) { clauses.push('julianday(received_at) > julianday(?)'); values.push(normalizeInstant(filter.receivedAfter)); }
    if (filter.receivedBefore) { clauses.push('julianday(received_at) < julianday(?)'); values.push(normalizeInstant(filter.receivedBefore)); }
    if (filter.threadId) { clauses.push('thread_id = ?'); values.push(filter.threadId); }
    if (filter.status) { clauses.push('status = ?'); values.push(filter.status); }
    const messages = await this.many<Message>(
      `SELECT data_json FROM mailfn_messages WHERE ${clauses.join(' AND ')} ORDER BY julianday(received_at) DESC, id DESC`,
      values,
    );
    return messages.filter((message) => matchesMessage(message, filter));
  }
  async listMessagesPage(
    projectId: string,
    inboxId: string,
    filter: MessageFilter,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }> {
    const cursor = cursorId ? await this.getMessage(cursorId) : null;
    if (cursorId && (!cursor || cursor.projectId !== projectId || cursor.inboxId !== inboxId || !matchesMessage(cursor, filter))) {
      return { items: [], hasMore: false, cursorFound: false };
    }
    const clauses = ['project_id = ?', 'inbox_id = ?'];
    const values: unknown[] = [projectId, inboxId];
    if (filter.receivedAfter) { clauses.push('julianday(received_at) > julianday(?)'); values.push(normalizeInstant(filter.receivedAfter)); }
    if (filter.receivedBefore) { clauses.push('julianday(received_at) < julianday(?)'); values.push(normalizeInstant(filter.receivedBefore)); }
    if (filter.threadId) { clauses.push('thread_id = ?'); values.push(filter.threadId); }
    if (filter.status) { clauses.push('status = ?'); values.push(filter.status); }
    if (filter.recipient) { clauses.push('lower(envelope_to) = ?'); values.push(filter.recipient.toLowerCase()); }
    if (filter.subject) { clauses.push('instr(lower(subject), ?) > 0'); values.push(filter.subject.toLowerCase()); }
    if (filter.text) {
      clauses.push(`instr(lower(coalesce(json_extract(data_json, '$.textBody'), '') || char(10) || coalesce(json_extract(data_json, '$.htmlBody'), '')), ?) > 0`);
      values.push(filter.text.toLowerCase());
    }
    if (filter.unreadOnly) clauses.push(`json_type(data_json, '$.readAt') IS NULL`);
    if (filter.sender) {
      clauses.push(`(lower(envelope_from) = ? OR EXISTS (
        SELECT 1 FROM json_each(mailfn_messages.data_json, '$.from') AS sender_entry
        WHERE lower(json_extract(sender_entry.value, '$.address')) = ?
      ))`);
      values.push(filter.sender.toLowerCase(), filter.sender.toLowerCase());
    }
    if (filter.senderDomain) {
      const suffix = `@${filter.senderDomain.toLowerCase()}`;
      clauses.push(`EXISTS (
        SELECT 1 FROM json_each(mailfn_messages.data_json, '$.from') AS sender_entry
        WHERE substr(lower(json_extract(sender_entry.value, '$.address')), -length(?)) = ?
      )`);
      values.push(suffix, suffix);
    }
    for (const label of filter.labels ?? []) {
      clauses.push(`EXISTS (
        SELECT 1 FROM json_each(mailfn_messages.data_json, '$.labels') AS label_entry
        WHERE label_entry.value = ?
      )`);
      values.push(label);
    }
    if (cursor) {
      clauses.push('(julianday(received_at) < julianday(?) OR (julianday(received_at) = julianday(?) AND id < ?))');
      values.push(cursor.receivedAt, cursor.receivedAt, cursor.id);
    }
    values.push(limit + 1);
    const messages = await this.many<Message>(
      `SELECT data_json FROM mailfn_messages
       WHERE ${clauses.join(' AND ')}
       ORDER BY julianday(received_at) DESC, id DESC
       LIMIT ?`,
      values,
    );
    return {
      items: messages.slice(0, limit),
      hasMore: messages.length > limit,
      cursorFound: true,
    };
  }
  async searchMessages(
    projectId: string,
    inboxId: string,
    input: Omit<SearchMessagesInput, 'projectId' | 'inboxId'>,
  ): Promise<Message[]> {
    const clauses = ['mailfn_messages_fts.project_id = ?', 'mailfn_messages_fts.inbox_id = ?', 'mailfn_messages_fts MATCH ?'];
    const values: unknown[] = [projectId, inboxId, ftsPhrase(input.query)];
    if (input.receivedAfter) { clauses.push('julianday(message.received_at) > julianday(?)'); values.push(normalizeInstant(input.receivedAfter)); }
    if (input.receivedBefore) { clauses.push('julianday(message.received_at) < julianday(?)'); values.push(normalizeInstant(input.receivedBefore)); }
    return this.many(
      `SELECT message.data_json FROM mailfn_messages_fts
       JOIN mailfn_messages AS message ON message.id = mailfn_messages_fts.message_id
       WHERE ${clauses.join(' AND ')} AND message.status = 'ready'
       ORDER BY julianday(message.received_at) DESC, message.id DESC`,
      values,
    );
  }
  async searchMessagesPage(
    projectId: string,
    inboxId: string,
    input: Omit<SearchMessagesInput, 'projectId' | 'inboxId' | 'cursor' | 'limit'>,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }> {
    const clauses = ['mailfn_messages_fts.project_id = ?', 'mailfn_messages_fts.inbox_id = ?', 'mailfn_messages_fts MATCH ?'];
    const values: unknown[] = [projectId, inboxId, ftsPhrase(input.query)];
    if (input.receivedAfter) { clauses.push('julianday(message.received_at) > julianday(?)'); values.push(normalizeInstant(input.receivedAfter)); }
    if (input.receivedBefore) { clauses.push('julianday(message.received_at) < julianday(?)'); values.push(normalizeInstant(input.receivedBefore)); }
    const cursor = cursorId ? await this.getMessage(cursorId) : null;
    if (cursorId) {
      if (!cursor || cursor.projectId !== projectId || cursor.inboxId !== inboxId) {
        return { items: [], hasMore: false, cursorFound: false };
      }
      const cursorMatch = await this.rawMany<{ id: string }>(
        `SELECT message.id FROM mailfn_messages_fts
         JOIN mailfn_messages AS message ON message.id = mailfn_messages_fts.message_id
         WHERE ${clauses.join(' AND ')} AND message.status = 'ready' AND message.id = ?
         LIMIT 1`,
        [...values, cursorId],
      );
      if (!cursorMatch.length) return { items: [], hasMore: false, cursorFound: false };
      clauses.push('(julianday(message.received_at) < julianday(?) OR (julianday(message.received_at) = julianday(?) AND message.id < ?))');
      values.push(cursor.receivedAt, cursor.receivedAt, cursor.id);
    }
    values.push(limit + 1);
    const messages = await this.many<Message>(
      `SELECT message.data_json FROM mailfn_messages_fts
       JOIN mailfn_messages AS message ON message.id = mailfn_messages_fts.message_id
       WHERE ${clauses.join(' AND ')} AND message.status = 'ready'
       ORDER BY julianday(message.received_at) DESC, message.id DESC
       LIMIT ?`,
      values,
    );
    return {
      items: messages.slice(0, limit),
      hasMore: messages.length > limit,
      cursorFound: true,
    };
  }
  async createInboundMessageIfInboxActive(value: Message): Promise<boolean> {
    const result = await this.database.prepare(
      `INSERT INTO mailfn_messages(id, project_id, inbox_id, provider_delivery_id, internet_message_id, envelope_from, envelope_to,
       subject, received_at, parsed_at, raw_object_key, raw_retention_expires_at, attachment_retention_expires_at, raw_deleted_at,
       thread_id, size_bytes, status, retention_expires_at, created_at, updated_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM mailfn_inboxes WHERE id = ? AND status = 'active')
       ON CONFLICT DO NOTHING`,
    ).bind(
      value.id, value.projectId, value.inboxId, value.providerDeliveryId, value.internetMessageId ?? null, value.envelopeFrom,
      value.envelopeTo, value.subject, value.receivedAt, value.parsedAt ?? null, value.rawObjectKey, value.rawRetentionExpiresAt,
      value.attachmentRetentionExpiresAt, value.rawDeletedAt ?? null, value.threadId ?? null, value.sizeBytes, value.status,
      value.retentionExpiresAt, value.createdAt, value.updatedAt, json(value), value.inboxId,
    ).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async saveMessage(value: Message): Promise<void> {
    const save = bind(
      this.database.prepare(
        `INSERT INTO mailfn_messages(id, project_id, inbox_id, provider_delivery_id, internet_message_id, envelope_from, envelope_to,
       subject, received_at, parsed_at, raw_object_key, raw_retention_expires_at, attachment_retention_expires_at, raw_deleted_at,
       thread_id, size_bytes, status, retention_expires_at, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET internet_message_id=excluded.internet_message_id, envelope_from=excluded.envelope_from,
       envelope_to=excluded.envelope_to, subject=excluded.subject, parsed_at=excluded.parsed_at, thread_id=excluded.thread_id,
       status=excluded.status, raw_deleted_at=excluded.raw_deleted_at, retention_expires_at=excluded.retention_expires_at,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
      ),
      [value.id, value.projectId, value.inboxId, value.providerDeliveryId, value.internetMessageId ?? null, value.envelopeFrom,
        value.envelopeTo, value.subject, value.receivedAt, value.parsedAt ?? null, value.rawObjectKey, value.rawRetentionExpiresAt,
        value.attachmentRetentionExpiresAt, value.rawDeletedAt ?? null, value.threadId ?? null, value.sizeBytes, value.status,
        value.retentionExpiresAt, value.createdAt, value.updatedAt, json(value)],
    );
    const removeSearch = this.database.prepare('DELETE FROM mailfn_messages_fts WHERE message_id = ?').bind(value.id);
    const saveSearch = this.database.prepare(
      'INSERT INTO mailfn_messages_fts(message_id, project_id, inbox_id, subject, text_body, html_body) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(value.id, value.projectId, value.inboxId, value.subject, value.textBody ?? '', value.htmlBody ?? '');
    const results = await this.database.batch([save, removeSearch, saveSearch]);
    if (results.some((result) => !result.success)) throw new Error('MAILFN_D1_WRITE_FAILED');
  }
  async claimMessageForParsing(messageId: string, claimedAt: string, leaseExpiresAt: string): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE mailfn_messages
       SET updated_at = ?, data_json = json_set(data_json, '$.parseLeaseExpiresAt', ?, '$.updatedAt', ?)
       WHERE id = ? AND status NOT IN ('ready', 'deleted')
         AND (json_extract(data_json, '$.parseLeaseExpiresAt') IS NULL OR json_extract(data_json, '$.parseLeaseExpiresAt') <= ?)`,
    ).bind(claimedAt, leaseExpiresAt, claimedAt, messageId, claimedAt).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async markMessageRead(messageId: string, readAt: string): Promise<Message | null> {
    const result = await this.database.prepare(
      `UPDATE mailfn_messages
       SET updated_at = ?, data_json = json_set(data_json, '$.readAt', ?, '$.updatedAt', ?)
       WHERE id = ? AND json_extract(data_json, '$.readAt') IS NULL`,
    ).bind(readAt, readAt, readAt, messageId).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return this.getMessage(messageId);
  }
  async setMessageLabels(messageId: string, labels: string[], updatedAt: string): Promise<Message | null> {
    const result = await this.database.prepare(
      `UPDATE mailfn_messages
       SET updated_at = ?, data_json = json_set(data_json, '$.labels', json(?), '$.updatedAt', ?)
       WHERE id = ?`,
    ).bind(updatedAt, JSON.stringify(labels), updatedAt, messageId).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return this.getMessage(messageId);
  }
  async deleteMessage(id: string): Promise<void> {
    const results = await this.database.batch([
      this.database.prepare('DELETE FROM mailfn_messages_fts WHERE message_id = ?').bind(id),
      this.database.prepare('DELETE FROM mailfn_messages WHERE id = ?').bind(id),
    ]);
    if (results.some((result) => !result.success)) throw new Error('MAILFN_D1_WRITE_FAILED');
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.one('SELECT data_json FROM mailfn_attachments WHERE id = ?', [id]);
  }
  async listAttachments(messageId: string): Promise<Attachment[]> {
    return this.many('SELECT data_json FROM mailfn_attachments WHERE message_id = ? ORDER BY created_at', [messageId]);
  }
  async saveAttachment(value: Attachment): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_attachments(id, project_id, inbox_id, message_id, filename, content_type, size_bytes, object_key, sha256, created_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, content_type=excluded.content_type, size_bytes=excluded.size_bytes,
       object_key=excluded.object_key, sha256=excluded.sha256, data_json=excluded.data_json`,
      [value.id, value.projectId, value.inboxId, value.messageId, value.filename, value.contentType, value.sizeBytes, value.objectKey, value.sha256, value.createdAt, json(value)],
    );
  }
  async deleteAttachment(id: string): Promise<void> {
    await this.run('DELETE FROM mailfn_attachments WHERE id = ?', [id]);
  }

  async getThread(id: string): Promise<Thread | null> {
    return this.one('SELECT data_json FROM mailfn_threads WHERE id = ?', [id]);
  }
  async listThreads(projectId: string, inboxId: string): Promise<Thread[]> {
    return this.many('SELECT data_json FROM mailfn_threads WHERE project_id = ? AND inbox_id = ? ORDER BY last_message_at DESC', [projectId, inboxId]);
  }
  async saveThread(value: Thread): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_threads(id, project_id, inbox_id, normalized_subject, last_message_at, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET normalized_subject=excluded.normalized_subject, last_message_at=excluded.last_message_at,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.inboxId, value.normalizedSubject, value.lastMessageAt, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async saveThreadIfUnchanged(value: Thread, expected: Thread | null): Promise<boolean> {
    const statement = expected
      ? bind(this.database.prepare(
        `UPDATE mailfn_threads
         SET normalized_subject = ?, last_message_at = ?, updated_at = ?, data_json = ?
         WHERE id = ? AND data_json = ?`,
      ), [value.normalizedSubject, value.lastMessageAt, value.updatedAt, json(value), value.id, json(expected)])
      : bind(this.database.prepare(
        `INSERT OR IGNORE INTO mailfn_threads(id, project_id, inbox_id, normalized_subject, last_message_at, created_at, updated_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ), [value.id, value.projectId, value.inboxId, value.normalizedSubject, value.lastMessageAt, value.createdAt, value.updatedAt, json(value)]);
    const result = await statement.run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async deleteMessageWithThread(messageId: string, expected: Thread, next: Thread | null): Promise<boolean> {
    const expectedJson = json(expected);
    const threadStatement = next
      ? bind(this.database.prepare(
        `UPDATE mailfn_threads
         SET normalized_subject = ?, last_message_at = ?, updated_at = ?, data_json = ?
         WHERE id = ? AND data_json = ?`,
      ), [next.normalizedSubject, next.lastMessageAt, next.updatedAt, json(next), expected.id, expectedJson])
      : bind(this.database.prepare('DELETE FROM mailfn_threads WHERE id = ? AND data_json = ?'), [expected.id, expectedJson]);
    const results = await this.database.batch([
      bind(this.database.prepare(
        `DELETE FROM mailfn_messages_fts
         WHERE message_id = ? AND EXISTS (
           SELECT 1 FROM mailfn_threads WHERE id = ? AND data_json = ?
         )`,
      ), [messageId, expected.id, expectedJson]),
      bind(this.database.prepare(
        `DELETE FROM mailfn_messages
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM mailfn_threads WHERE id = ? AND data_json = ?
         )`,
      ), [messageId, expected.id, expectedJson]),
      threadStatement,
    ]);
    if (results.some((result) => !result.success)) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(results[1]?.meta?.changes ?? 0) > 0 && Number(results[2]?.meta?.changes ?? 0) > 0;
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return this.one('SELECT data_json FROM mailfn_webhooks WHERE id = ?', [id]);
  }
  async listWebhooks(projectId: string, inboxId?: string): Promise<Webhook[]> {
    return inboxId
      ? this.many('SELECT data_json FROM mailfn_webhooks WHERE project_id = ? AND inbox_id = ? ORDER BY created_at', [projectId, inboxId])
      : this.many('SELECT data_json FROM mailfn_webhooks WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async createWebhookWithQuota(value: Webhook, maxWebhooks: number): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `INSERT INTO mailfn_webhooks(id, project_id, inbox_id, url, event_types, secret_hash, status, created_at, updated_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM mailfn_webhooks WHERE project_id = ? AND status = 'active') < ?`,
    ), [
      value.id, value.projectId, value.inboxId ?? null, value.url, JSON.stringify(value.eventTypes), value.secretHash,
      value.status, value.createdAt, value.updatedAt, json(value), value.projectId, maxWebhooks,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async saveWebhook(value: Webhook): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_webhooks(id, project_id, inbox_id, url, event_types, secret_hash, status, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET url=excluded.url, event_types=excluded.event_types, secret_hash=excluded.secret_hash,
       status=excluded.status, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.inboxId ?? null, value.url, JSON.stringify(value.eventTypes), value.secretHash, value.status, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async saveWebhookDelivery(value: WebhookDelivery): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_webhook_deliveries(id, webhook_id, event_id, attempt, status, next_attempt_at, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET attempt=excluded.attempt, status=excluded.status, next_attempt_at=excluded.next_attempt_at,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.webhookId, value.eventId, value.attempt, value.status, value.nextAttemptAt ?? null, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async listWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
    return this.many('SELECT data_json FROM mailfn_webhook_deliveries WHERE webhook_id = ? ORDER BY created_at', [webhookId]);
  }

  async getDraft(id: string): Promise<Draft | null> {
    return this.one('SELECT data_json FROM mailfn_drafts WHERE id = ?', [id]);
  }
  async listDrafts(projectId: string, inboxId: string): Promise<Draft[]> {
    return this.many('SELECT data_json FROM mailfn_drafts WHERE project_id = ? AND inbox_id = ? ORDER BY created_at', [projectId, inboxId]);
  }
  async saveDraft(value: Draft): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_drafts(id, project_id, inbox_id, thread_id, status, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id, status=excluded.status, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.inboxId, value.threadId ?? null, value.status, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async saveDraftIfInboxWritable(value: Draft): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `INSERT INTO mailfn_drafts(id, project_id, inbox_id, thread_id, status, created_at, updated_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM mailfn_inboxes
         WHERE id = ? AND project_id = ? AND status NOT IN ('deleting', 'deleted')
       )
       ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id, status=excluded.status,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
    ), [
      value.id, value.projectId, value.inboxId, value.threadId ?? null, value.status,
      value.createdAt, value.updatedAt, json(value), value.inboxId, value.projectId,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async claimDraft(draftId: string, expectedStatus: Draft['status'], value: Draft): Promise<boolean> {
    const result = await bind(
      this.database.prepare(
        `UPDATE mailfn_drafts SET status = ?, updated_at = ?, data_json = ?
         WHERE id = ? AND status = ? AND EXISTS (
           SELECT 1 FROM mailfn_inboxes
           WHERE id = ? AND project_id = ? AND status NOT IN ('deleting', 'deleted')
         )`,
      ),
      [value.status, value.updatedAt, json(value), draftId, expectedStatus, value.inboxId, value.projectId],
    ).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async deleteDrafts(projectId: string, inboxId: string): Promise<void> {
    await this.run('DELETE FROM mailfn_drafts WHERE project_id = ? AND inbox_id = ?', [projectId, inboxId]);
  }

  async getDomain(id: string): Promise<MailDomain | null> {
    return this.one('SELECT data_json FROM mailfn_domains WHERE id = ?', [id]);
  }
  async getDomainByName(projectId: string, domain: string): Promise<MailDomain | null> {
    return this.one('SELECT data_json FROM mailfn_domains WHERE project_id = ? AND domain = ?', [projectId, domain]);
  }
  async getDomainByNameAcrossProjects(domain: string): Promise<MailDomain | null> {
    return this.one('SELECT data_json FROM mailfn_domains WHERE domain = ?', [domain]);
  }
  async listDomains(projectId: string): Promise<MailDomain[]> {
    return this.many('SELECT data_json FROM mailfn_domains WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async createDomain(value: MailDomain): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `INSERT OR IGNORE INTO mailfn_domains(id, project_id, domain, status, verification_token, verified_at, created_at, updated_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM mailfn_domains WHERE domain = ?)`,
    ), [value.id, value.projectId, value.domain, value.status, value.verificationToken, value.verifiedAt ?? null, value.createdAt, value.updatedAt, json(value), value.domain]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async createDomainWithQuota(value: MailDomain, maxDomains: number): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `INSERT OR IGNORE INTO mailfn_domains(id, project_id, domain, status, verification_token, verified_at, created_at, updated_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM mailfn_domains WHERE domain = ?)
         AND (SELECT COUNT(*) FROM mailfn_domains WHERE project_id = ?) < ?`,
    ), [
      value.id, value.projectId, value.domain, value.status, value.verificationToken,
      value.verifiedAt ?? null, value.createdAt, value.updatedAt, json(value),
      value.domain, value.projectId, maxDomains,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async saveDomain(value: MailDomain): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_domains(id, project_id, domain, status, verification_token, verified_at, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, verification_token=excluded.verification_token,
       verified_at=excluded.verified_at, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.domain, value.status, value.verificationToken, value.verifiedAt ?? null, value.createdAt, value.updatedAt, json(value)],
    );
  }

  async appendEvent(value: MailFnEvent): Promise<void> {
    await this.run(
      `INSERT OR IGNORE INTO mailfn_events(id, project_id, inbox_id, message_id, type, version, occurred_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [value.id, value.projectId, value.inboxId ?? null, value.messageId ?? null, value.type, value.version, value.occurredAt, json(value)],
    );
  }
  async listEvents(projectId: string, after?: string): Promise<MailFnEvent[]> {
    return after
      ? this.many('SELECT data_json FROM mailfn_events WHERE project_id = ? AND occurred_at > ? ORDER BY occurred_at', [projectId, after])
      : this.many('SELECT data_json FROM mailfn_events WHERE project_id = ? ORDER BY occurred_at', [projectId]);
  }
  async deleteTerminalWebhookDeliveriesBefore(projectId: string, before: string): Promise<number> {
    const ids = await this.rawMany<{ id: string }>(
      `SELECT delivery.id FROM mailfn_webhook_deliveries AS delivery
       JOIN mailfn_webhooks AS webhook ON webhook.id = delivery.webhook_id
       WHERE webhook.project_id = ? AND delivery.status IN ('delivered', 'dead_letter') AND delivery.updated_at <= ?`,
      [projectId, before],
    );
    if (ids.length) await this.database.batch(ids.map(({ id }) => this.database.prepare('DELETE FROM mailfn_webhook_deliveries WHERE id = ?').bind(id)));
    return ids.length;
  }
  async deleteEventsBefore(projectId: string, before: string): Promise<number> {
    const ids = await this.rawMany<{ id: string }>(
      `SELECT event.id FROM mailfn_events AS event
       WHERE event.project_id = ? AND event.occurred_at <= ? AND NOT EXISTS (
         SELECT 1 FROM mailfn_webhook_deliveries AS delivery
         WHERE delivery.event_id = event.id AND delivery.status IN ('pending', 'failed')
       )`,
      [projectId, before],
    );
    if (ids.length) await this.database.batch(ids.map(({ id }) => this.database.prepare('DELETE FROM mailfn_events WHERE id = ?').bind(id)));
    return ids.length;
  }
  async appendAudit(value: AuditEvent): Promise<void> {
    const result = await auditInsert(this.database, value, true).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
  }
  async listAudits(projectId: string, after?: string): Promise<AuditEvent[]> {
    return after
      ? this.many('SELECT data_json FROM mailfn_audits WHERE project_id = ? AND created_at > ? ORDER BY created_at', [projectId, after])
      : this.many('SELECT data_json FROM mailfn_audits WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async deleteExpiredAudits(projectId: string, now: string): Promise<number> {
    const ids = await this.rawMany<{ id: string }>('SELECT id FROM mailfn_audits WHERE project_id = ? AND retention_expires_at <= ?', [projectId, now]);
    if (ids.length) await this.database.batch(ids.map(({ id }) => this.database.prepare('DELETE FROM mailfn_audits WHERE id = ?').bind(id)));
    return ids.length;
  }

  async getIdempotency(projectId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.one('SELECT data_json FROM mailfn_idempotency WHERE project_id = ? AND key = ?', [projectId, key]);
  }
  async createIdempotency(value: IdempotencyRecord): Promise<boolean> {
    const result = await bind(this.database.prepare(
      `INSERT OR IGNORE INTO mailfn_idempotency(project_id, key, operation, resource_id, request_hash, expires_at, created_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ), [
      value.projectId, value.key, value.operation, value.resourceId, value.requestHash,
      value.expiresAt, value.createdAt, json(value),
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    return Number(result.meta?.changes ?? 0) === 1;
  }
  async saveIdempotency(value: IdempotencyRecord): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_idempotency(project_id, key, operation, resource_id, request_hash, expires_at, created_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, key) DO UPDATE SET operation=excluded.operation, resource_id=excluded.resource_id,
       request_hash=excluded.request_hash, expires_at=excluded.expires_at, data_json=excluded.data_json`,
      [value.projectId, value.key, value.operation, value.resourceId, value.requestHash, value.expiresAt, value.createdAt, json(value)],
    );
  }
  async deleteExpiredIdempotency(projectId: string, key: string, now: string): Promise<void> {
    await this.run('DELETE FROM mailfn_idempotency WHERE project_id = ? AND key = ? AND expires_at <= ?', [projectId, key, now]);
  }
  async reserveIngressQuota(reservation: IngressQuotaReservation): Promise<IngressQuotaDecision> {
    await this.run('DELETE FROM mailfn_ingress_reservations WHERE bucket < ?', [reservation.bucket]);
    const result = await bind(this.database.prepare(
      `INSERT INTO mailfn_ingress_reservations(id, project_id, inbox_id, sender, bucket, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM mailfn_ingress_reservations WHERE project_id = ? AND bucket = ?) < ?
         AND (SELECT COUNT(*) FROM mailfn_ingress_reservations WHERE project_id = ? AND inbox_id = ? AND bucket = ?) < ?
         AND (SELECT COUNT(*) FROM mailfn_ingress_reservations WHERE project_id = ? AND sender = ? AND bucket = ?) < ?`,
    ), [
      reservation.id, reservation.projectId, reservation.inboxId, reservation.sender, reservation.bucket, reservation.createdAt,
      reservation.projectId, reservation.bucket, reservation.projectLimit,
      reservation.projectId, reservation.inboxId, reservation.bucket, reservation.inboxLimit,
      reservation.projectId, reservation.sender, reservation.bucket, reservation.senderLimit,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    if (Number(result.meta?.changes ?? 0) === 1) return { allowed: true };
    const [counts] = await this.rawMany<{ project_count: number; inbox_count: number; sender_count: number }>(
      `SELECT
        SUM(CASE WHEN project_id = ? THEN 1 ELSE 0 END) AS project_count,
        SUM(CASE WHEN project_id = ? AND inbox_id = ? THEN 1 ELSE 0 END) AS inbox_count,
        SUM(CASE WHEN project_id = ? AND sender = ? THEN 1 ELSE 0 END) AS sender_count
       FROM mailfn_ingress_reservations WHERE bucket = ?`,
      [reservation.projectId, reservation.projectId, reservation.inboxId, reservation.projectId, reservation.sender, reservation.bucket],
    );
    if (Number(counts?.project_count ?? 0) >= reservation.projectLimit) return { allowed: false, dimension: 'project' };
    if (Number(counts?.inbox_count ?? 0) >= reservation.inboxLimit) return { allowed: false, dimension: 'inbox' };
    return { allowed: false, dimension: 'sender' };
  }
  async releaseIngressQuota(reservationId: string): Promise<void> {
    await this.run('DELETE FROM mailfn_ingress_reservations WHERE id = ?', [reservationId]);
  }
  async reserveStorage(
    reservation: { id: string; projectId: string; bytes: number; createdAt: string },
    limit: number,
  ): Promise<'created' | 'existing' | 'denied'> {
    if ((await this.rawMany<{ id: string }>('SELECT id FROM mailfn_storage_reservations WHERE id = ?', [reservation.id])).length) {
      return 'existing';
    }
    const result = await bind(this.database.prepare(
      `INSERT INTO mailfn_storage_reservations(id, project_id, bytes, created_at)
       SELECT ?, ?, ?, ?
       WHERE COALESCE((SELECT SUM(bytes) FROM mailfn_storage_reservations WHERE project_id = ?), 0) + ? <= ?`,
    ), [reservation.id, reservation.projectId, reservation.bytes, reservation.createdAt, reservation.projectId, reservation.bytes, limit]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    if (Number(result.meta?.changes ?? 0) === 1) return 'created';
    return (await this.rawMany<{ id: string }>('SELECT id FROM mailfn_storage_reservations WHERE id = ?', [reservation.id])).length
      ? 'existing'
      : 'denied';
  }
  async releaseStorage(reservationId: string): Promise<void> {
    await this.run('DELETE FROM mailfn_storage_reservations WHERE id = ?', [reservationId]);
  }

  async appendUsage(value: UsageRecord): Promise<void> {
    await this.run(
      'INSERT OR IGNORE INTO mailfn_usage(id, project_id, metric, quantity, period, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [value.id, value.projectId, value.metric, value.quantity, value.period, value.createdAt, json(value)],
    );
  }
  async reserveOutboundUsage(value: UsageRecord, limit: number): Promise<'created' | 'existing' | 'denied'> {
    if (await this.one<UsageRecord>('SELECT data_json FROM mailfn_usage WHERE id = ?', [value.id])) return 'existing';
    const result = await bind(this.database.prepare(
      `INSERT INTO mailfn_usage(id, project_id, metric, quantity, period, created_at, data_json)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE COALESCE((SELECT SUM(quantity) FROM mailfn_usage WHERE project_id = ? AND period = ? AND metric = 'outbound_message'), 0) + ? <= ?`,
    ), [
      value.id, value.projectId, value.metric, value.quantity, value.period, value.createdAt, json(value),
      value.projectId, value.period, value.quantity, limit,
    ]).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
    if (Number(result.meta?.changes ?? 0) === 1) return 'created';
    return await this.one<UsageRecord>('SELECT data_json FROM mailfn_usage WHERE id = ?', [value.id]) ? 'existing' : 'denied';
  }
  async releaseUsage(id: string): Promise<void> {
    await this.run('DELETE FROM mailfn_usage WHERE id = ?', [id]);
  }
  async listUsage(projectId: string, period?: string): Promise<UsageRecord[]> {
    return period
      ? this.many('SELECT data_json FROM mailfn_usage WHERE project_id = ? AND period = ? ORDER BY created_at', [projectId, period])
      : this.many('SELECT data_json FROM mailfn_usage WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async saveAbuseCase(value: AbuseCase): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_abuse_cases(id, project_id, kind, status, resource_type, resource_id, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.kind, value.status, value.resourceType, value.resourceId, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async listAbuseCases(projectId: string): Promise<AbuseCase[]> {
    return this.many('SELECT data_json FROM mailfn_abuse_cases WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async getSenderReputation(projectId: string, sender: string): Promise<SenderReputation | null> {
    return this.one('SELECT data_json FROM mailfn_sender_reputation WHERE project_id = ? AND sender = ?', [projectId, sender]);
  }
  async listSenderReputations(projectId: string): Promise<SenderReputation[]> {
    return this.many('SELECT data_json FROM mailfn_sender_reputation WHERE project_id = ? ORDER BY score, sender', [projectId]);
  }
  async saveSenderReputation(value: SenderReputation): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_sender_reputation(project_id, sender, status, score, complaint_count, bounce_count, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, sender) DO UPDATE SET status=excluded.status, score=excluded.score,
       complaint_count=excluded.complaint_count, bounce_count=excluded.bounce_count,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.projectId, value.sender, value.status, value.score, value.complaintCount, value.bounceCount, value.updatedAt, json(value)],
    );
  }
  async saveSupportCase(value: SupportCase): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_support_cases(id, project_id, severity, status, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET severity=excluded.severity, status=excluded.status, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.id, value.projectId, value.severity, value.status, value.createdAt, value.updatedAt, json(value)],
    );
  }
  async listSupportCases(projectId: string): Promise<SupportCase[]> {
    return this.many('SELECT data_json FROM mailfn_support_cases WHERE project_id = ? ORDER BY created_at', [projectId]);
  }
  async getComplianceProfile(projectId: string): Promise<ComplianceProfile | null> {
    return this.one('SELECT data_json FROM mailfn_compliance WHERE project_id = ?', [projectId]);
  }
  async saveComplianceProfile(value: ComplianceProfile): Promise<void> {
    await this.run(
      `INSERT INTO mailfn_compliance(project_id, data_region, retention_locked, deletion_sla_hours, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET data_region=excluded.data_region, retention_locked=excluded.retention_locked,
       deletion_sla_hours=excluded.deletion_sla_hours, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      [value.projectId, value.dataRegion, value.retentionLocked ? 1 : 0, value.deletionSlaHours, value.updatedAt, json(value)],
    );
  }

  private async one<T>(query: string, values: unknown[]): Promise<T | null> {
    const row = await bind(this.database.prepare(query), values).first<JsonRow>();
    return row ? parse<T>(row.data_json) : null;
  }

  private async many<T>(query: string, values: unknown[]): Promise<T[]> {
    const rows = await this.rawMany<JsonRow>(query, values);
    return rows.map((row) => parse<T>(row.data_json));
  }

  private async rawMany<T>(query: string, values: unknown[]): Promise<T[]> {
    const result = await bind(this.database.prepare(query), values).all<T>();
    if (!result.success) throw new Error('MAILFN_D1_QUERY_FAILED');
    return result.results ?? [];
  }

  private async run(query: string, values: unknown[]): Promise<void> {
    const result = await bind(this.database.prepare(query), values).run();
    if (!result.success) throw new Error('MAILFN_D1_WRITE_FAILED');
  }
}

function bind(statement: D1PreparedStatement, values: unknown[]): D1PreparedStatement {
  return values.length ? statement.bind(...values) : statement;
}

function credentialInsert(database: D1Database, value: Credential): D1PreparedStatement {
  return bind(database.prepare(
    `INSERT INTO mailfn_credentials(id, project_id, inbox_id, token_hash, token_prefix, permissions, status, expires_at, revoked_at, created_at, data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ), [value.id, value.projectId, value.inboxId ?? null, value.tokenHash, value.tokenPrefix, JSON.stringify(value.permissions), value.status, value.expiresAt ?? null, value.revokedAt ?? null, value.createdAt, json(value)]);
}

function auditInsert(database: D1Database, value: AuditEvent, ignoreDuplicate = false): D1PreparedStatement {
  return bind(database.prepare(
    `INSERT ${ignoreDuplicate ? 'OR IGNORE ' : ''}INTO mailfn_audits(
       id, project_id, actor_type, actor_id, action, resource_type, resource_id, created_at, retention_expires_at, data_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ), [
    value.id, value.projectId, value.actorType, value.actorId, value.action, value.resourceType,
    value.resourceId, value.createdAt, value.retentionExpiresAt, json(value),
  ]);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function normalizeInstant(value: string): string {
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? value : new Date(instant).toISOString();
}

function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function matchesMessage(message: Message, filter: MessageFilter): boolean {
  if (filter.sender) {
    const sender = filter.sender.toLowerCase();
    if (message.envelopeFrom.toLowerCase() !== sender && !message.from.some((entry) => entry.address.toLowerCase() === sender)) return false;
  }
  if (filter.senderDomain && !message.from.some((entry) => entry.address.toLowerCase().endsWith(`@${filter.senderDomain!.toLowerCase()}`))) return false;
  if (filter.recipient && message.envelopeTo.toLowerCase() !== filter.recipient.toLowerCase()) return false;
  if (filter.subject && !message.subject.toLowerCase().includes(filter.subject.toLowerCase())) return false;
  if (filter.text && !`${message.textBody ?? ''}\n${message.htmlBody ?? ''}`.toLowerCase().includes(filter.text.toLowerCase())) return false;
  const receivedAt = Date.parse(message.receivedAt);
  if (filter.receivedAfter && receivedAt <= Date.parse(filter.receivedAfter)) return false;
  if (filter.receivedBefore && receivedAt >= Date.parse(filter.receivedBefore)) return false;
  if (filter.unreadOnly && message.readAt) return false;
  if (filter.threadId && message.threadId !== filter.threadId) return false;
  if (filter.labels?.some((label) => !message.labels.includes(label))) return false;
  if (filter.status && message.status !== filter.status) return false;
  return true;
}
