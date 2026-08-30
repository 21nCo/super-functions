import { describe, expect, it } from 'vitest';

import type { Message } from '@mailfn/core';

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
  async run<T>(): Promise<D1Result<T>> { return { success: true, results: [] }; }
}

class RecordingDatabase implements D1Database {
  public readonly statements: RecordingStatement[] = [];

  prepare(query: string): D1PreparedStatement {
    const statement = new RecordingStatement(query);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>> {
    return statements.map(() => ({ success: true, results: [] }));
  }
  async exec(): Promise<{ count: number; duration: number }> { return { count: 0, duration: 0 }; }
}

describe('D1MailFnStore', () => {
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
});
