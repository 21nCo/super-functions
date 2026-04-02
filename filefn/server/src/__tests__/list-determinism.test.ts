import { describe, expect, it } from 'vitest';
import { createFileService } from '../files/service.js';
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

function createDb(files: any[]): Adapter {
  const tables = new Map<string, Map<string, any>>();
  tables.set('files', new Map(files.map((file) => [file.fileId, file])));

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function matches(row: any, where: any[] = []): boolean {
    for (const clause of where) {
      const value = row?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'lt' && !(value < clause.value)) return false;
      if (clause.operator === 'in' && !clause.value.includes(value)) return false;
    }
    return true;
  }

  return {
    id: 'phase0-list-db',
    name: 'phase0-list-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const table = getTable(params.model);
      const row = { ...params.data };
      table.set(row.fileId || `id_${table.size + 1}`, row);
      return row;
    },
    async findOne(params) {
      const table = getTable(params.model);
      for (const row of table.values()) {
        if (matches(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      const table = getTable(params.model);
      const rows = Array.from(table.values()).filter((row) => matches(row, params.where));
      return params.limit ? rows.slice(0, params.limit) : rows;
    },
    async update(params) {
      const table = getTable(params.model);
      for (const [id, row] of table.entries()) {
        if (matches(row, params.where)) {
          const next = { ...row, ...params.data };
          table.set(id, next);
          return next;
        }
      }
      return null;
    },
    async delete(params) {
      const table = getTable(params.model);
      for (const [id, row] of table.entries()) {
        if (matches(row, params.where)) {
          table.delete(id);
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

describe('PHASE_03 FILE-001 deterministic list semantics', () => {
  it('TV-FILE-LIST-001: listFiles should enforce stable sort and cursor-based pagination', async () => {
    const service = createFileService({
      db: createDb([
        {
          fileId: 'file_002',
          currentVersionId: 'ver_002',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 20,
          name: 'older.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
        {
          fileId: 'file_003',
          currentVersionId: 'ver_003',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 30,
          name: 'newer-b.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T15:00:00.000Z',
        },
        {
          fileId: 'file_001',
          currentVersionId: 'ver_001',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 10,
          name: 'newer-a.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T15:00:00.000Z',
        },
      ]),
      storage: { capabilities: { signedDownloadUrls: true } } as any,
      events: createEventEmitter(),
      namespace: 'filefn',
    });

    const firstPage = await service.listFiles(
      { principalId: 'user_123', tenantId: 'org_123' },
      { limit: 2 }
    );

    expect(firstPage.files.map((file) => file.fileId)).toEqual(['file_001', 'file_003']);

    const secondPage = await service.listFiles(
      { principalId: 'user_123', tenantId: 'org_123' },
      { limit: 2, cursor: firstPage.nextCursor }
    );

    expect(secondPage.files.map((file) => file.fileId)).toEqual(['file_002']);
  });
});
