/**
 * Test vectors for version metadata and binding (VERSION-001, SERVER-002)
 * 
 * These tests encode the audit gaps for version operations:
 * - TV-VERSION-GET-001: Get version metadata
 * - TV-VERSION-DOWNLOAD-BINDING-NEG-001: Version download rejects when versionId doesn't belong to fileId
 * - TV-POLICY-LIST-001: GET /policies returns policy constraints
 * - TV-QUOTA-GET-001: GET /quota/storage returns quota usage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFileFn, type FileFn, type QuotaProvider } from '../index.js';
import { createFakeStorageAdapter } from '@superfunctions/storage';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

const FAKE_CAPABILITIES: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

function createFakeDbAdapter(): Adapter {
  const tables = new Map<string, Map<string, any>>();
  let idCounter = 1;

  function getTable(model: string): Map<string, any> {
    if (!tables.has(model)) tables.set(model, new Map());
    return tables.get(model)!;
  }

  function matchesWhere(record: any, where: any[]): boolean {
    for (const clause of where) {
      const value = record[clause.field];
      switch (clause.operator) {
        case 'eq': if (value !== clause.value) return false; break;
        case 'ne': if (value === clause.value) return false; break;
        default: break;
      }
    }
    return true;
  }

  return {
    id: 'fake',
    name: 'fake',
    version: '1.0.0',
    capabilities: FAKE_CAPABILITIES,
    async create(params) {
      const table = getTable(params.model);
      const id = params.model === 'fileVersions'
        ? (params.data.versionId || params.data.fileId || params.data.uploadSessionId || params.data.permissionId || `id_${idCounter++}`)
        : (params.data.uploadSessionId || params.data.fileId || params.data.versionId || params.data.permissionId || `id_${idCounter++}`);
      const record = { ...params.data, _id: id };
      table.set(id, record);
      return record;
    },
    async findOne(params) {
      const table = getTable(params.model);
      for (const record of table.values()) {
        if (matchesWhere(record, params.where)) return record;
      }
      return null;
    },
    async findMany(params) {
      const table = getTable(params.model);
      const results: any[] = [];
      for (const record of table.values()) {
        if (!params.where || params.where.length === 0 || matchesWhere(record, params.where)) {
          results.push(record);
        }
      }
      if (params.orderBy?.some((o: any) => o.field === 'createdAt' && o.direction === 'desc')) {
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return results.slice(0, params.limit || results.length);
    },
    async update(params) {
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
          const updated = { ...record, ...params.data };
          table.set(id, updated);
          return updated;
        }
      }
      return null;
    },
    async delete(params) {
      const table = getTable(params.model);
      for (const [id, record] of table.entries()) {
        if (matchesWhere(record, params.where)) {
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
        return await this.update({ model: params.model, where: params.where, data: params.update, namespace: params.namespace });
      }
      return await this.create({ model: params.model, data: params.create, namespace: params.namespace });
    },
    async count() { return 0; },
    async transaction(callback) { return callback(this as any); },
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

async function createFileViaUpload(fileFn: FileFn, db: Adapter, storageSizes: Map<string, number>, principalId: string, tenantId?: string): Promise<{ fileId: string; versionId: string }> {
  const { uploadSessionId } = await fileFn.createUploadSession(
    { policy: 'user-avatar', fileName: 'avatar.png', size: 2097152, mimeType: 'image/png' },
    { principalId, tenantId }
  );

  const session = await db.findOne<any>({ model: 'uploadSessions', where: [{ field: 'uploadSessionId', operator: 'eq', value: uploadSessionId }] });
  if (session) storageSizes.set(session.storageKey, 2097152);
  
  await fileFn.completeUploadPart(
    { uploadSessionId, partNumber: 1, etag: 'etag1', size: 2097152 },
    { principalId, tenantId }
  );
  
  return fileFn.completeUploadSession({ uploadSessionId }, { principalId, tenantId });
}

describe('@filefn/server version metadata', () => {
  let db: Adapter;
  let fileFn: FileFn;
  let storageSizes: Map<string, number>;

  beforeEach(() => {
    db = createFakeDbAdapter();
    storageSizes = new Map();
    const storage = createFakeStorageAdapter({
      capabilities: {
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: false,
        proxyStreamingDownload: true,
      },
      async statObject(input) {
        return { key: input.key, size: storageSizes.get(input.key) ?? 1024 };
      }
    });

    fileFn = createFileFn({
      db,
      storage,
      policies: [
        {
          name: 'user-avatar',
          contentTypes: ['image/png', 'image/jpeg'],
          maxSizeBytes: 10485760,
          visibility: 'private',
        },
      ],
      auth: { required: false },
    });
  });

  describe('TV-VERSION-GET-001: Get version metadata', () => {
    it('should return version metadata when versionId belongs to fileId', async () => {
      const fileFnWithAuth = createFileFn({
        db,
        storage: createFakeStorageAdapter({
          capabilities: {
            signedUploadUrls: true,
            signedDownloadUrls: true,
            multipart: true,
            proxyStreamingUpload: false,
            proxyStreamingDownload: true,
          },
        }),
        policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 10485760 }],
        auth: {
          required: false,
          resolveSession: async () => ({ principalId: 'user_123' }),
        },
      });

      const { fileId, versionId } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');

      const request = new Request(`http://localhost/${fileId}/versions/${versionId}`, {
        method: 'GET',
        headers: { 'x-request-id': 'req_070' },
      });

      const response = await fileFnWithAuth.router.handle(request);
      
      // This will fail until version metadata route is implemented
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const body = await response!.json();
      expect(body.ok).toBe(true);
      expect(body.data.versionId).toBe(versionId);
      expect(body.data.fileId).toBe(fileId);
      expect(body.data.size).toBeDefined();
      expect(body.data.mimeType).toBe('image/png');
      expect(body.data.createdAt).toBeDefined();
      expect(body.requestId).toBe('req_070');
    });
  });

  describe('TV-VERSION-001: provider getFile({ versionId }) semantics', () => {
    it('returns metadata for the requested non-current version', async () => {
      const { fileId, versionId: oldVersionId } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');
      const newVersionId = 'ver_new_manual';

      await db.create({
        model: 'fileVersions',
        data: {
          versionId: newVersionId,
          fileId,
          storageKey: `uploads/${fileId}/${newVersionId}`,
          mimeType: 'image/jpeg',
          size: 4096,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T16:00:00.000Z',
        },
      });

      await db.update({
        model: 'files',
        where: [{ field: 'fileId', operator: 'eq', value: fileId }],
        data: {
          currentVersionId: newVersionId,
          mimeType: 'image/jpeg',
          size: 4096,
          updatedAt: '2026-03-20T16:00:00.000Z',
        },
      });

      const result = await fileFn.getFile(
        { fileId, versionId: oldVersionId },
        { principalId: 'user_123' },
      ) as any;

      expect(result.fileId).toBe(fileId);
      expect(result.versionId).toBe(oldVersionId);
      expect(result.currentVersionId).toBe(oldVersionId);
      expect(result.mimeType).toBe('image/png');
    });

    it('throws FILEFN_NOT_FOUND for cross-file version binding mismatch', async () => {
      const { fileId: fileId1 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');
      const { versionId: versionId2 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');

      await expect(
        fileFn.getFile(
          { fileId: fileId1, versionId: versionId2 },
          { principalId: 'user_123' },
        ),
      ).rejects.toMatchObject({ code: 'FILEFN_NOT_FOUND' });
    });
  });

  describe('TV-VERSION-DOWNLOAD-BINDING-NEG-001: Version binding check', () => {
    it('should reject download when versionId does not belong to fileId', async () => {
      const fileFnWithAuth = createFileFn({
        db,
        storage: createFakeStorageAdapter({
          capabilities: {
            signedUploadUrls: true,
            signedDownloadUrls: true,
            multipart: true,
            proxyStreamingUpload: false,
            proxyStreamingDownload: true,
          },
        }),
        policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 10485760 }],
        auth: {
          required: false,
          resolveSession: async () => ({ principalId: 'user_123' }),
        },
      });

      // Create two files
      const { fileId: fileId1 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');
      const { versionId: versionId2 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');

      // Try to download fileId1 with versionId2 (wrong binding)
      const request = new Request(`http://localhost/${fileId1}/versions/${versionId2}/download`, {
        method: 'GET',
        headers: { 'x-request-id': 'req_071' },
      });

      const response = await fileFnWithAuth.router.handle(request);
      
      // This will fail until version binding check is implemented
      expect(response!.status).toBe(404);

      const body = await response!.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('FILEFN_NOT_FOUND');
      expect(body.requestId).toBe('req_071');
    });

    it('should reject version metadata when versionId does not belong to fileId', async () => {
      const fileFnWithAuth = createFileFn({
        db,
        storage: createFakeStorageAdapter({
          capabilities: {
            signedUploadUrls: true,
            signedDownloadUrls: true,
            multipart: true,
            proxyStreamingUpload: false,
            proxyStreamingDownload: true,
          },
        }),
        policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 10485760 }],
        auth: {
          required: false,
          resolveSession: async () => ({ principalId: 'user_123' }),
        },
      });

      const { fileId: fileId1 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');
      const { versionId: versionId2 } = await createFileViaUpload(fileFn, db, storageSizes, 'user_123');

      const request = new Request(`http://localhost/${fileId1}/versions/${versionId2}`, {
        method: 'GET',
        headers: { 'x-request-id': 'req_072' },
      });

      const response = await fileFnWithAuth.router.handle(request);
      
      // This will fail until version binding check is implemented
      expect(response!.status).toBe(404);

      const body = await response!.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('FILEFN_NOT_FOUND');
    });
  });
});

describe('@filefn/server missing routes', () => {
  let db: Adapter;

  beforeEach(() => {
    db = createFakeDbAdapter();
  });

  describe('TV-POLICY-LIST-001: GET /policies', () => {
    it('should list policy constraints', async () => {
      const fileFn = createFileFn({
        db,
        storage: createFakeStorageAdapter({
          capabilities: {
            signedUploadUrls: true,
            signedDownloadUrls: true,
            multipart: true,
            proxyStreamingUpload: false,
            proxyStreamingDownload: true,
          },
        }),
        policies: [
          {
            name: 'user-avatar',
            contentTypes: ['image/png', 'image/jpeg'],
            maxSizeBytes: 10485760,
            visibility: 'private',
          },
          {
            name: 'documents',
            contentTypes: ['application/pdf'],
            maxSizeBytes: 52428800,
            visibility: 'shared',
          },
        ],
        auth: { required: false },
      });

      const request = new Request('http://localhost/policies', {
        method: 'GET',
        headers: { 'x-request-id': 'req_030' },
      });

      const response = await fileFn.router.handle(request);
      
      // This will fail until /policies route is implemented
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const body = await response!.json();
      expect(body.ok).toBe(true);
      expect(body.data.policies).toBeDefined();
      expect(body.data.policies.length).toBe(2);
      
      const avatarPolicy = body.data.policies.find((p: any) => p.name === 'user-avatar');
      expect(avatarPolicy).toBeDefined();
      expect(avatarPolicy.maxSizeBytes).toBe(10485760);
      expect(avatarPolicy.contentTypes).toContain('image/png');
      expect(avatarPolicy.contentTypes).toContain('image/jpeg');
      expect(body.requestId).toBe('req_030');
    });
  });

  describe('TV-QUOTA-GET-001: GET /quota/storage', () => {
    it('should return storage quota usage when quota provider exists', async () => {
      const quotaProvider: QuotaProvider = {
        async checkQuota() {
          return { allowed: true, current: 5, limit: 10 };
        },
        async recordUsage() {},
        async getUsage(principalId: string) {
          return { current: 5, limit: 10 };
        },
      };

      const fileFn = createFileFn({
        db,
        storage: createFakeStorageAdapter({
          capabilities: {
            signedUploadUrls: true,
            signedDownloadUrls: true,
            multipart: true,
            proxyStreamingUpload: false,
            proxyStreamingDownload: true,
          },
        }),
        policies: [{ name: 'user-avatar', contentTypes: ['image/png'], maxSizeBytes: 10485760 }],
        auth: {
          required: false,
          resolveSession: async () => ({ principalId: 'user_123' }),
        },
        quota: quotaProvider,
      });

      const request = new Request('http://localhost/quota/storage', {
        method: 'GET',
        headers: { 'x-request-id': 'req_080' },
      });

      const response = await fileFn.router.handle(request);
      
      // This will fail until /quota/storage route is implemented
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const body = await response!.json();
      expect(body.ok).toBe(true);
      expect(body.data.current).toBe(5);
      expect(body.data.limit).toBe(10);
      expect(body.requestId).toBe('req_080');
    });
  });
});
