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

function createMemoryDb(): Adapter {
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

  return {
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
      return Array.from(table(params.model).values()).filter((row) => match(row, params.where));
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
}

function createMultipartStorage() {
  return {
    capabilities: {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: false,
      proxyStreamingDownload: true,
    },
    createMultipartUpload: vi.fn(async () => ({ uploadId: 'up_1' })),
    completeMultipartUpload: vi.fn(async () => {}),
    signMultipartUploadPartUrl: vi.fn(async () => ({ url: 'https://signed.example/upload', headers: {} })),
  };
}

function createHarness() {
  const db = createMemoryDb();
  const service = createUploadSessionService({
    db,
    storage: createMultipartStorage() as any,
    policies: {
      get: vi.fn(() => ({ maxSizeBytes: 100 * 1024 * 1024, contentTypes: ['text/plain'], visibility: 'private' })),
    } as any,
    events: { emit: vi.fn() } as any,
  });

  return { db, service };
}

function createService() {
  return createHarness().service;
}

describe('PHASE_00 idempotency and completion semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TV-IDEMPOTENCY-001: identical init idempotency key returns original success result', async () => {
    const service = createService();
    const input = {
      policy: 'p1',
      fileName: 'a.txt',
      size: 3,
      mimeType: 'text/plain',
      idempotencyKey: 'idem_001',
    };
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_1' };

    const first = await service.createSession(input, ctx);
    const second = await service.createSession(input, ctx);

    expect(second.uploadSessionId).toBe(first.uploadSessionId);
    expect(second.uploadMode).toBe(first.uploadMode);
    expect(second.totalParts).toBe(first.totalParts);
  });

  it('TV-AUTH-001: anonymous init replay returns the original upload session token', async () => {
    const { service } = createHarness();
    const input = {
      policy: 'p1',
      fileName: 'anon.txt',
      size: 3,
      mimeType: 'text/plain',
      idempotencyKey: 'idem_anon_service_001',
    };
    const ctx = { requestId: 'req_anon_service_1' };

    const first = await service.createSession(input, ctx);
    const replay = await service.createSession(input, { requestId: 'req_anon_service_2' });

    expect(first.uploadSessionId).toBe(replay.uploadSessionId);
    expect(first.uploadSessionToken).toBeDefined();
    expect(replay.uploadSessionToken).toBe(first.uploadSessionToken);
  });

  it('TV-IDEMPOTENCY-NEG-001: idempotency-key mismatch returns FILEFN_IDEMPOTENCY_CONFLICT', async () => {
    const service = createService();
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_2' };

    await service.createSession(
      {
        policy: 'p1',
        fileName: 'a.txt',
        size: 3,
        mimeType: 'text/plain',
        idempotencyKey: 'idem_002',
      },
      ctx,
    );

    await expect(
      service.createSession(
        {
          policy: 'p1',
          fileName: 'b.txt',
          size: 3,
          mimeType: 'text/plain',
          idempotencyKey: 'idem_002',
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'FILEFN_IDEMPOTENCY_CONFLICT' });
  });

  it('TV-IDEMPOTENCY-001: part recording is tuple-idempotent and conflicting tuple returns FILEFN_PART_CONFLICT', async () => {
    const service = createService();
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_3' };

    const session = await service.createSession(
      { policy: 'p1', fileName: 'part.txt', size: 3, mimeType: 'text/plain' },
      ctx,
    );

    await service.completePart(session.uploadSessionId, 1, 'etag_1', 3, ctx);
    await expect(service.completePart(session.uploadSessionId, 1, 'etag_1', 3, ctx)).resolves.toBeUndefined();

    await expect(service.completePart(session.uploadSessionId, 1, 'etag_1', 4, ctx)).rejects.toMatchObject({
      code: 'FILEFN_PART_CONFLICT',
    });
  });

  it('TV-IDEMPOTENCY-001: repeated complete returns stable { fileId, versionId }', async () => {
    const service = createService();
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_4' };

    const session = await service.createSession(
      { policy: 'p1', fileName: 'complete.txt', size: 3, mimeType: 'text/plain' },
      ctx,
    );

    await service.completePart(session.uploadSessionId, 1, 'etag_1', 3, ctx);
    const first = await service.completeSession(session.uploadSessionId, ctx);
    const second = await service.completeSession(session.uploadSessionId, ctx);

    expect(second).toEqual(first);
  });

  it('TV-META-001: completion persists init metadata onto the file row', async () => {
    const { db, service } = createHarness();
    const metadata = {
      source: 'import',
      category: 'note',
      nested: { reviewed: false },
    };
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_meta_1' };

    const session = await service.createSession(
      {
        policy: 'p1',
        fileName: 'meta.txt',
        size: 3,
        mimeType: 'text/plain',
        metadata,
      },
      ctx,
    );

    await service.completePart(session.uploadSessionId, 1, 'etag_meta_1', 3, ctx);
    const completed = await service.completeSession(session.uploadSessionId, ctx);
    const file = await db.findOne({
      model: 'files',
      where: [{ field: 'fileId', operator: 'eq', value: completed.fileId }],
      namespace: 'filefn',
    });

    expect(file?.metadata).toEqual(metadata);
  });

  it('TV-IDEMPOTENCY-NEG-001: incomplete upload completion fails with FILEFN_UPLOAD_INCOMPLETE', async () => {
    const service = createService();
    const ctx = { principalId: 'user_1', tenantId: 'org_1', requestId: 'req_5' };

    const twoPartUpload = await service.createSession(
      { policy: 'p1', fileName: 'large.txt', size: 9 * 1024 * 1024, mimeType: 'text/plain' },
      ctx,
    );

    await service.completePart(twoPartUpload.uploadSessionId, 1, 'etag_1', 8 * 1024 * 1024, ctx);

    await expect(service.completeSession(twoPartUpload.uploadSessionId, ctx)).rejects.toMatchObject({
      code: 'FILEFN_UPLOAD_INCOMPLETE',
    });
  });
});
