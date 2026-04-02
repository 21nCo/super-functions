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
  let i = 1;

  function table(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function match(record: any, where: any[] = []): boolean {
    for (const clause of where) {
      const value = record?.[clause.field];
      if (clause.operator === 'eq' && value !== clause.value) return false;
      if (clause.operator === 'ne' && value === clause.value) return false;
      if (clause.operator === 'lt' && !(value < clause.value)) return false;
    }
    return true;
  }

  return {
    id: 'phase0-db',
    name: 'phase0-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const t = table(params.model);
      const id =
        params.data.uploadSessionId ||
        params.data.fileId ||
        params.data.versionId ||
        params.data.permissionId ||
        `id_${i++}`;
      const record = { ...params.data, _id: id };
      t.set(id, record);
      return record;
    },
    async findOne(params) {
      const t = table(params.model);
      for (const row of t.values()) {
        if (match(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      const t = table(params.model);
      const rows = Array.from(t.values()).filter((row) => match(row, params.where));
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
}

function json(data: unknown) {
  return JSON.stringify(data);
}

describe('PHASE_00 AUTH-001 upload-session binding tests', () => {
  let fileFn: FileFn;

  beforeEach(() => {
    fileFn = createFileFn({
      db: createDb(),
      storage: createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async statObject() {
          return { key: 'k', size: 3 };
        },
      }),
      policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 1024 * 1024 }],
      auth: {
        required: false,
        resolveSession: async (request) => {
          const principalId = request.headers.get('x-user-id');
          const tenantId = request.headers.get('x-tenant-id') || undefined;
          if (!principalId) return null;
          return { principalId, tenantId };
        },
      },
    });
  });

  it('TV-UPLOAD-AUTH-NEG-001: cross-principal follow-up should be forbidden', async () => {
    const initReq = new Request('http://localhost/upload/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user_123',
        'x-tenant-id': 'org_123',
      },
      body: json({
        policy: 'user-avatar',
        fileName: 'avatar.png',
        size: 3,
        mimeType: 'image/png',
      }),
    });

    const initRes = await fileFn.router.handle(initReq);
    const initBody = await initRes!.json();
    const uploadSessionId = initBody.data.uploadSessionId as string;

    const statusReq = new Request(`http://localhost/upload/${uploadSessionId}/status`, {
      method: 'GET',
      headers: { 'x-user-id': 'user_999', 'x-tenant-id': 'org_123' },
    });

    const statusRes = await fileFn.router.handle(statusReq);
    const statusBody = await statusRes!.json();

    expect(statusRes!.status).toBe(403);
    expect(statusBody.error.code).toBe('FILEFN_FORBIDDEN');
  });

  it('TV-UPLOAD-AUTH-001: anonymous init should mint uploadSessionToken', async () => {
    const initReq = new Request('http://localhost/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json({
        policy: 'user-avatar',
        fileName: 'anonymous.png',
        size: 3,
        mimeType: 'image/png',
      }),
    });

    const initRes = await fileFn.router.handle(initReq);
    const initBody = await initRes!.json();

    expect(initBody.data.uploadSessionToken).toMatch(/^upls_/);
  });
});
