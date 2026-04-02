import { describe, expect, it } from 'vitest';
import { createFileService, type FileRecord } from '../files/service.js';
import { createEventEmitter } from '../events.js';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

const CAPS: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

type Row = Record<string, any>;

function createDb(seed: { files?: Row[]; permissions?: Row[] }): Adapter {
  const tables = new Map<string, Map<string, Row>>();

  tables.set('files', new Map((seed.files || []).map((file) => [file.fileId, file])));
  tables.set(
    'filePermissions',
    new Map((seed.permissions || []).map((permission, idx) => [`perm_${idx + 1}`, permission])),
  );

  function table(model: string): Map<string, Row> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function match(record: Row, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'in' && !clause.value.includes(value)) return false;
      if (clause.operator === 'lt' && !(value < clause.value)) return false;
      if (clause.operator === 'gt' && !(value > clause.value)) return false;
    }
    return true;
  }

  return {
    id: 'file-list-db',
    name: 'file-list-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const t = table(params.model);
      const id = params.data.fileId || params.data.versionId || params.data.uploadSessionId || `id_${t.size + 1}`;
      const row = { ...params.data, _id: id };
      t.set(id, row);
      return row;
    },
    async findOne(params) {
      for (const row of table(params.model).values()) {
        if (match(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      let rows = Array.from(table(params.model).values()).filter((row) => match(row, params.where));
      const orderBy = params.orderBy;
      if (orderBy && orderBy.length > 0) {
        rows = rows.sort((a, b) => {
          for (const clause of orderBy) {
            const aValue = a[clause.field];
            const bValue = b[clause.field];
            if (aValue === bValue) continue;
            if (clause.direction === 'asc') return aValue < bValue ? -1 : 1;
            return aValue > bValue ? -1 : 1;
          }
          return 0;
        });
      }
      return params.limit ? rows.slice(0, params.limit) : rows;
    },
    async update(params) {
      const t = table(params.model);
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          const next = { ...row, ...params.data };
          t.set(id, next);
          return next;
        }
      }
      return null;
    },
    async delete(params) {
      const t = table(params.model);
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          t.delete(id);
          return;
        }
      }
    },
    async createMany() { return []; },
    async updateMany() { return 0; },
    async deleteMany() { return 0; },
    async upsert(params) {
      const existing = await this.findOne({ model: params.model, where: params.where, namespace: params.namespace });
      if (existing) {
        return this.update({ model: params.model, where: params.where, data: params.update, namespace: params.namespace });
      }
      return this.create({ model: params.model, data: params.create, namespace: params.namespace });
    },
    async count() { return 0; },
    async transaction(cb) { return cb(this as any); },
    async initialize() {},
    async isHealthy() { return { healthy: true, uptime: 0 }; },
    async close() {},
    async getSchemaVersion() { return 0; },
    async setSchemaVersion() {},
    async validateSchema() { return { valid: true }; },
    internal: {
      async ensureTable() {},
      async create() { return {}; },
      async findOne() { return null; },
      async findMany() { return []; },
      async update() { return 0; },
      async delete() { return 0; },
    },
  } as Adapter;
}

function buildFile(input: Partial<FileRecord> & Pick<FileRecord, 'fileId' | 'ownerId' | 'updatedAt'>): FileRecord {
  return {
    fileId: input.fileId,
    currentVersionId: input.currentVersionId || `ver_${input.fileId}`,
    ownerId: input.ownerId,
    tenantId: input.tenantId ?? 'org_123',
    visibility: input.visibility || 'private',
    policy: input.policy || 'user-avatar',
    mimeType: input.mimeType || 'image/png',
    size: input.size ?? 10,
    name: input.name || `${input.fileId}.png`,
    metadata: input.metadata || {},
    createdAt: input.createdAt || '2026-03-20T10:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}

describe('PHASE_03 FILE-001 deterministic list semantics', () => {
  it('TV-FILE-LIST-001: returns readable set in deterministic order with stable cursor pagination', async () => {
    const db = createDb({
      files: [
        buildFile({ fileId: 'file_003', ownerId: 'user_123', updatedAt: '2026-03-20T15:00:00.000Z' }),
        buildFile({ fileId: 'file_001', ownerId: 'user_123', updatedAt: '2026-03-20T14:00:00.000Z' }),
        buildFile({ fileId: 'file_004', ownerId: 'user_999', updatedAt: '2026-03-20T13:00:00.000Z', tenantId: 'org_999' }),
        buildFile({ fileId: 'file_002', ownerId: 'user_999', updatedAt: '2026-03-20T16:00:00.000Z', tenantId: 'org_999' }),
      ],
      permissions: [
        {
          fileId: 'file_004',
          principalId: 'user_123',
          canRead: true,
          tenantId: 'org_123',
        },
      ],
    });

    const service = createFileService({
      db,
      storage: { capabilities: { signedDownloadUrls: true } } as any,
      events: createEventEmitter(),
      namespace: 'filefn',
    });

    const ctx = { principalId: 'user_123', tenantId: 'org_123' };

    const firstRun = await service.listFiles(ctx, { limit: 2 });
    const secondRun = await service.listFiles(ctx, { limit: 2 });

    expect(firstRun.files.map((f) => f.fileId)).toEqual(['file_003', 'file_001']);
    expect(secondRun.files.map((f) => f.fileId)).toEqual(['file_003', 'file_001']);
    expect(firstRun.nextCursor).toBeDefined();

    const page2 = await service.listFiles(ctx, { limit: 2, cursor: firstRun.nextCursor });
    expect(page2.files.map((f) => f.fileId)).toEqual(['file_004']);

    const allReturned = [...firstRun.files, ...page2.files].map((f) => f.fileId);
    expect(allReturned).not.toContain('file_002');
  });

  it('FILE-001: default limit is 20 and max limit is capped at 100', async () => {
    const files: FileRecord[] = [];
    for (let i = 1; i <= 120; i++) {
      files.push(
        buildFile({
          fileId: `file_${i.toString().padStart(3, '0')}`,
          ownerId: 'user_123',
          updatedAt: `2026-03-20T12:${(i % 60).toString().padStart(2, '0')}:00.000Z`,
        }),
      );
    }

    const service = createFileService({
      db: createDb({ files }),
      storage: { capabilities: { signedDownloadUrls: true } } as any,
      events: createEventEmitter(),
      namespace: 'filefn',
    });

    const ctx = { principalId: 'user_123', tenantId: 'org_123' };

    const defaultPage = await service.listFiles(ctx);
    expect(defaultPage.files).toHaveLength(20);

    const cappedPage = await service.listFiles(ctx, { limit: 999 });
    expect(cappedPage.files).toHaveLength(100);
  });

  it('TV-FILE-LIST-002: cursor tie-breaking stays consistent for mixed-case file IDs', async () => {
    const db = createDb({
      files: [
        buildFile({ fileId: 'file_a', ownerId: 'user_123', updatedAt: '2026-03-20T15:00:00.000Z' }),
        buildFile({ fileId: 'file_B', ownerId: 'user_123', updatedAt: '2026-03-20T15:00:00.000Z' }),
        buildFile({ fileId: 'file_c', ownerId: 'user_123', updatedAt: '2026-03-20T14:00:00.000Z' }),
      ],
    });

    const service = createFileService({
      db,
      storage: { capabilities: { signedDownloadUrls: true } } as any,
      events: createEventEmitter(),
      namespace: 'filefn',
    });

    const page1 = await service.listFiles({ principalId: 'user_123', tenantId: 'org_123' }, { limit: 2 });
    const page2 = await service.listFiles({ principalId: 'user_123', tenantId: 'org_123' }, { limit: 2, cursor: page1.nextCursor });

    expect(page1.files.map((file) => file.fileId)).toEqual(['file_a', 'file_B']);
    expect(page2.files.map((file) => file.fileId)).toEqual(['file_c']);
  });
});
