import { beforeEach, describe, expect, it } from 'vitest';
import { createFileFn, type FileFn } from '../index.js';
import { createFakeStorageAdapter } from '@superfunctions/storage';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

const CAPS: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

function createDb(): Adapter {
  const tables = new Map<string, Map<string, any>>();
  let seq = 1;

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function matches(record: any, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
    }
    return true;
  }

  return {
    id: 'phase0-upload-status-db',
    name: 'phase0-upload-status-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const table = getTable(params.model);
      const id =
        params.data.uploadSessionId ||
        params.data.fileId ||
        params.data.versionId ||
        params.data.permissionId ||
        `id_${seq++}`;
      const record = { ...params.data, _id: id };
      table.set(id, record);
      return record;
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
      return Array.from(table.values()).filter((row) => matches(row, params.where));
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

describe('PHASE_00 UPLOAD-001/API-001 upload status contract', () => {
  let fileFn: FileFn;

  beforeEach(() => {
    fileFn = createFileFn({
      db: createDb(),
      storage: createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: false,
          proxyStreamingDownload: true,
        },
      }),
      policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 1024 * 1024 }],
      auth: {
        required: false,
        resolveSession: async () => ({ principalId: 'user_123', tenantId: 'org_123' }),
      },
    });
  });

  it('TV-UPLOAD-STATUS-001: status response should expose canonical resumability fields', async () => {
    const initRes = await fileFn.router.handle(
      new Request('http://localhost/upload/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_004' },
        body: JSON.stringify({
          policy: 'user-avatar',
          fileName: 'photo.png',
          size: 9,
          mimeType: 'image/png',
        }),
      })
    );

    const initBody = await initRes!.json();
    const uploadSessionId = initBody.data.uploadSessionId as string;

    const statusRes = await fileFn.router.handle(
      new Request(`http://localhost/upload/${uploadSessionId}/status`, {
        method: 'GET',
        headers: { 'x-request-id': 'req_004' },
      })
    );

    const statusBody = await statusRes!.json();

    expect(statusBody.ok).toBe(true);
    expect(statusBody.requestId).toBe('req_004');
    expect(statusBody.data).toMatchObject({
      uploadSessionId,
      fileId: expect.any(String),
      status: expect.any(String),
      totalParts: expect.any(Number),
      recordedParts: expect.any(Array),
      chunkSizeBytes: expect.any(Number),
      fileSize: expect.any(Number),
      expiresAt: expect.any(String),
    });
  });

  it('TV-ENVELOPE-NEG-001: not-found should still use canonical error envelope', async () => {
    const res = await fileFn.router.handle(
      new Request('http://localhost/upload/upl_missing/status', {
        method: 'GET',
        headers: { 'x-request-id': 'req_002' },
      })
    );

    const body = await res!.json();

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('FILEFN_SESSION_NOT_FOUND');
    expect(body.requestId).toBe('req_002');
  });
});
