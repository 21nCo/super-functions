import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploadSessionService } from '../upload-sessions/service.js';
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

type MemoryDb = {
  db: Adapter;
  all(model: string): Row[];
};

function createMemoryDb(): MemoryDb {
  const tables = new Map<string, Map<string, Row>>();
  let idCounter = 1;

  function table(model: string): Map<string, Row> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function match(record: Row, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'lt' && !(value < clause.value)) return false;
      if (clause.operator === 'gt' && !(value > clause.value)) return false;
    }
    return true;
  }

  const db: Adapter = {
    id: 'mem-db',
    name: 'mem-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const t = table(params.model);
      const id =
        (params.model === 'uploadParts' ? `${params.data.uploadSessionId}:${params.data.partNumber}` : undefined) ||
        (params.model === 'uploadSessions' ? params.data.uploadSessionId : undefined) ||
        (params.model === 'files' ? params.data.fileId : undefined) ||
        (params.model === 'fileVersions' ? params.data.versionId : undefined) ||
        params.data.permissionId ||
        params.data.artifactId ||
        `id_${idCounter++}`;
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
      const rows = Array.from(table(params.model).values()).filter((row) => match(row, params.where));
      if (params.select && params.select.length > 0) {
        return rows.map((row) => {
          const projected: Row = {};
          for (const key of params.select!) projected[key] = row[key];
          return projected;
        });
      }
      return rows;
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
    async deleteMany(params) {
      const t = table(params.model);
      let deleted = 0;
      for (const [id, row] of t.entries()) {
        if (match(row, params.where)) {
          t.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
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

  return {
    db,
    all(model: string) {
      return Array.from(table(model).values());
    },
  };
}

function createStorage() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    adapter: {
      capabilities: {
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: true,
        proxyStreamingDownload: true,
      },
      abortMultipartUpload: vi.fn(async () => {}),
      deleteObject: vi.fn(async ({ key }: { key: string }) => {
        objects.delete(key);
      }),
    },
  };
}

describe('PHASE_02 upload cleanup semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TV-UPLOAD-GC-001: cleanup removes expired incomplete sessions, aborts multipart, and deletes proxy temp parts + uploadPart rows', async () => {
    const db = createMemoryDb();
    const storage = createStorage();
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: { get: vi.fn(() => ({ maxSizeBytes: 10 * 1024 * 1024 })) } as any,
      events: { emit: vi.fn() } as any,
    });

    const old = new Date(Date.now() - 60_000).toISOString();

    await db.db.create({ model: 'uploadSessions', data: {
      uploadSessionId: 's_proxy',
      status: 'pending',
      uploadMode: 'proxy',
      storageKey: 'k_proxy',
      storageUploadId: null,
      ownerId: 'user_1',
      tenantId: null,
      totalParts: 2,
      size: 3,
      mimeType: 'text/plain',
      fileName: 'a.txt',
      policy: 'p1',
      chunkSizeBytes: 8 * 1024 * 1024,
      fileId: null,
      expiresAt: old,
      createdAt: old,
    }, namespace: 'filefn' });

    await db.db.create({ model: 'uploadSessions', data: {
      uploadSessionId: 's_multipart',
      status: 'in_progress',
      uploadMode: 'multipart-signed-url',
      storageKey: 'k_mp',
      storageUploadId: 'up_mp',
      ownerId: 'user_1',
      tenantId: null,
      totalParts: 1,
      size: 3,
      mimeType: 'text/plain',
      fileName: 'b.txt',
      policy: 'p1',
      chunkSizeBytes: 8 * 1024 * 1024,
      fileId: null,
      expiresAt: old,
      createdAt: old,
    }, namespace: 'filefn' });

    await db.db.create({ model: 'uploadSessions', data: {
      uploadSessionId: 's_done',
      status: 'completed',
      uploadMode: 'proxy',
      storageKey: 'k_done',
      storageUploadId: null,
      ownerId: 'user_1',
      tenantId: null,
      totalParts: 1,
      size: 3,
      mimeType: 'text/plain',
      fileName: 'c.txt',
      policy: 'p1',
      chunkSizeBytes: 8 * 1024 * 1024,
      fileId: 'file_done',
      expiresAt: old,
      createdAt: old,
    }, namespace: 'filefn' });

    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_proxy', partNumber: 1, etag: 'e1', size: 1 }, namespace: 'filefn' });
    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_proxy', partNumber: 2, etag: 'e2', size: 2 }, namespace: 'filefn' });
    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_multipart', partNumber: 1, etag: 'e3', size: 3 }, namespace: 'filefn' });
    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_done', partNumber: 1, etag: 'e4', size: 3 }, namespace: 'filefn' });

    storage.objects.set('k_proxy.part1', new TextEncoder().encode('a'));
    storage.objects.set('k_proxy.part2', new TextEncoder().encode('bc'));

    const result = await service.cleanupExpiredSessions();

    expect(result.deletedSessions).toBe(2);
    expect(result.abortedMultipart).toBe(1);
    expect(storage.adapter.abortMultipartUpload).toHaveBeenCalledWith({ key: 'k_mp', target: 'durable', uploadId: 'up_mp' });

    const remainingSessions = db.all('uploadSessions').map((s) => s.uploadSessionId);
    expect(remainingSessions).toEqual(['s_done']);

    const remainingParts = db.all('uploadParts').map((p) => p.uploadSessionId);
    expect(remainingParts).toEqual(['s_done']);

    expect(storage.adapter.deleteObject).toHaveBeenCalledWith({ key: 'k_proxy.part1', target: 'durable' });
    expect(storage.adapter.deleteObject).toHaveBeenCalledWith({ key: 'k_proxy.part2', target: 'durable' });

    const secondRun = await service.cleanupExpiredSessions();
    expect(secondRun.deletedSessions).toBe(0);
    expect(secondRun.abortedMultipart).toBe(0);
  });

  it('TV-UPLOAD-GC-001: abort removes proxy temp part objects and uploadPart rows', async () => {
    const db = createMemoryDb();
    const storage = createStorage();
    const service = createUploadSessionService({
      db: db.db,
      storage: storage.adapter as any,
      policies: { get: vi.fn(() => ({ maxSizeBytes: 10 * 1024 * 1024 })) } as any,
      events: { emit: vi.fn() } as any,
    });

    const future = new Date(Date.now() + 60_000).toISOString();

    await db.db.create({ model: 'uploadSessions', data: {
      uploadSessionId: 's_abort',
      status: 'in_progress',
      uploadMode: 'proxy',
      storageKey: 'k_abort',
      storageUploadId: null,
      ownerId: 'user_1',
      tenantId: null,
      totalParts: 2,
      size: 3,
      mimeType: 'text/plain',
      fileName: 'abort.txt',
      policy: 'p1',
      chunkSizeBytes: 8 * 1024 * 1024,
      fileId: null,
      expiresAt: future,
      createdAt: new Date().toISOString(),
    }, namespace: 'filefn' });

    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_abort', partNumber: 1, etag: 'e1', size: 1 }, namespace: 'filefn' });
    await db.db.create({ model: 'uploadParts', data: { uploadSessionId: 's_abort', partNumber: 2, etag: 'e2', size: 2 }, namespace: 'filefn' });

    storage.objects.set('k_abort.part1', new TextEncoder().encode('a'));
    storage.objects.set('k_abort.part2', new TextEncoder().encode('bc'));

    await service.abortSession('s_abort', { principalId: 'user_1', requestId: 'req_abort' });

    const aborted = await db.db.findOne({
      model: 'uploadSessions',
      where: [{ field: 'uploadSessionId', operator: 'eq', value: 's_abort' }],
      namespace: 'filefn',
    });
    expect(aborted?.status).toBe('aborted');

    const parts = await db.db.findMany({
      model: 'uploadParts',
      where: [{ field: 'uploadSessionId', operator: 'eq', value: 's_abort' }],
      namespace: 'filefn',
    });
    expect(parts).toHaveLength(0);

    expect(storage.adapter.deleteObject).toHaveBeenCalledWith({ key: 'k_abort.part1', target: 'durable' });
    expect(storage.adapter.deleteObject).toHaveBeenCalledWith({ key: 'k_abort.part2', target: 'durable' });
  });
});
