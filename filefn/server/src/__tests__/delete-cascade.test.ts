import { describe, expect, it } from 'vitest';
import { createFileService } from '../files/service.js';
import { createEventEmitter } from '../events.js';
import { createPolicyRegistry } from '../policies.js';
import { createRoutedStorageAdapter, type StorageAdapter, type StorageAdapterCapabilities } from '@superfunctions/storage';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';

const CAPS: AdapterCapabilities = {
  types: { json: true, dates: true, booleans: true, bigint: false, uuid: false, enum: false },
  operations: { batch: false, upsert: true, streaming: false, fulltext: false, returning: false },
  transactions: { supported: false, nested: false },
  performance: { supportsJoins: false, supportsPreparedStatements: false },
  schema: { migrations: false, constraints: false, indexes: false },
  advanced: { customIdGeneration: false, numericIds: false, schemaNamespaces: false, customTypes: false },
};

function createDb(seed: Record<string, any[]>) {
  const tables = new Map<string, Map<string, any>>();
  let seq = 1;

  function keyFor(row: any): string {
    return (
      row.versionId ||
      row.permissionId ||
      row.artifactId ||
      row.tokenHash ||
      (row.uploadSessionId && row.partNumber !== undefined ? `${row.uploadSessionId}:${row.partNumber}` : undefined) ||
      row.uploadSessionId ||
      row.fileId ||
      `id_${seq++}`
    );
  }

  for (const [model, rows] of Object.entries(seed)) {
    const t = new Map<string, any>();
    for (const row of rows) t.set(keyFor(row), { ...row });
    tables.set(model, t);
  }

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

  const adapter: Adapter = {
    id: 'phase0-delete-db',
    name: 'phase0-delete-db',
    version: '1.0.0',
    capabilities: CAPS,
    async create(params) {
      const t = getTable(params.model);
      const row = { ...params.data };
      t.set(keyFor(row), row);
      return row;
    },
    async findOne(params) {
      const t = getTable(params.model);
      for (const row of t.values()) {
        if (matches(row, params.where)) return row;
      }
      return null;
    },
    async findMany(params) {
      const t = getTable(params.model);
      return Array.from(t.values()).filter((row) => matches(row, params.where));
    },
    async update(params) {
      const t = getTable(params.model);
      for (const [id, row] of t.entries()) {
        if (matches(row, params.where)) {
          const next = { ...row, ...params.data };
          t.set(id, next);
          return next;
        }
      }
      return null;
    },
    async delete(params) {
      const t = getTable(params.model);
      for (const [id, row] of t.entries()) {
        if (matches(row, params.where)) {
          t.delete(id);
          return;
        }
      }
    },
    async createMany() { return []; },
    async updateMany() { return 0; },
    async deleteMany(params) {
      const t = getTable(params.model);
      let deleted = 0;
      for (const [id, row] of t.entries()) {
        if (matches(row, params.where)) {
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
    adapter,
    rows(model: string) {
      return Array.from(getTable(model).values());
    },
  };
}

describe('PHASE_05 FILE-004 delete cascade semantics', () => {
  it('TV-DELETE-CASCADE-001: delete removes related metadata, cleans artifacts/temp parts, and keeps shared storage alive', async () => {
    const db = createDb({
      files: [
        {
          fileId: 'file_0001',
          currentVersionId: 'ver_0001',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 100,
          name: 'one.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
        {
          fileId: 'file_0002',
          currentVersionId: 'ver_0002',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 100,
          name: 'two.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      fileVersions: [
        {
          versionId: 'ver_0001',
          fileId: 'file_0001',
          storageKey: 'shared/storage-key',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
        {
          versionId: 'ver_0003',
          fileId: 'file_0001',
          storageKey: 'unique/storage-key',
          mimeType: 'image/png',
          size: 25,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:01.000Z',
        },
        {
          versionId: 'ver_0002',
          fileId: 'file_0002',
          storageKey: 'shared/storage-key',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      filePermissions: [
        {
          permissionId: 'perm_0001',
          fileId: 'file_0001',
          principalId: 'user_456',
          canRead: true,
          canWrite: false,
          canDelete: false,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      fileShares: [
        {
          tokenHash: 'hash_0001',
          fileId: 'file_0001',
          versionId: 'ver_0001',
          expiresAt: null,
          requiresAuth: false,
          maxDownloads: null,
          downloads: 0,
          revokedAt: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      fileArtifacts: [
        {
          artifactId: 'art_0001',
          fileId: 'file_0001',
          versionId: 'ver_0001',
          kind: 'thumbnail',
          storageKey: 'artifact/storage-key',
          mimeType: 'image/webp',
          size: 11,
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      uploadSessions: [
        {
          uploadSessionId: 'upl_0001',
          status: 'pending',
          policy: 'user-avatar',
          fileId: 'file_0001',
          fileName: 'stale.png',
          mimeType: 'image/png',
          size: 55,
          uploadMode: 'proxy',
          chunkSizeBytes: 8,
          totalParts: 7,
          storageKey: 'tmp/session-key',
          storageUploadId: null,
          ownerId: 'user_123',
          tenantId: 'org_123',
          expiresAt: '2026-03-21T12:00:00.000Z',
          createdAt: '2026-03-20T12:00:00.000Z',
        },
        {
          uploadSessionId: 'upl_0002',
          status: 'in_progress',
          policy: 'user-avatar',
          fileId: 'file_0001',
          fileName: 'stale-multipart.png',
          mimeType: 'image/png',
          size: 77,
          uploadMode: 'multipart-signed-url',
          chunkSizeBytes: 8,
          totalParts: 10,
          storageKey: 'tmp/multipart-key',
          storageUploadId: 'mp_0001',
          ownerId: 'user_123',
          tenantId: 'org_123',
          expiresAt: '2026-03-21T12:00:00.000Z',
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      uploadParts: [
        {
          uploadSessionId: 'upl_0001',
          partNumber: 1,
          etag: 'etag_1',
          size: 8,
          checksumSha256Base64: null,
        },
        {
          uploadSessionId: 'upl_0002',
          partNumber: 1,
          etag: 'etag_2',
          size: 8,
          checksumSha256Base64: null,
        },
      ],
    });

    const deletedKeys: string[] = [];
    const abortedMultipart: Array<{ key: string; uploadId: string }> = [];
    const quotaDeltas: Array<{ principalId?: string; tenantId?: string; bytes: number }> = [];

    const service = createFileService({
      db: db.adapter,
      storage: {
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async deleteObject(input: { key: string }) {
          deletedKeys.push(input.key);
        },
        async abortMultipartUpload(input: { key: string; uploadId: string }) {
          abortedMultipart.push(input);
        },
      } as any,
      events: createEventEmitter(),
      quota: {
        async checkQuota() {
          return { allowed: true, current: 0, limit: Number.MAX_SAFE_INTEGER };
        },
        async recordUsage(input) {
          quotaDeltas.push(input);
        },
      },
      namespace: 'filefn',
    });

    await service.deleteFile('file_0001', {
      principalId: 'user_123',
      tenantId: 'org_123',
      requestId: 'req_delete_001',
    });

    expect(db.rows('filePermissions').filter((row) => row.fileId === 'file_0001')).toHaveLength(0);
    expect(db.rows('fileShares').filter((row) => row.fileId === 'file_0001')).toHaveLength(0);
    expect(db.rows('fileArtifacts').filter((row) => row.fileId === 'file_0001')).toHaveLength(0);
    expect(db.rows('fileVersions').filter((row) => row.fileId === 'file_0001')).toHaveLength(0);
    expect(db.rows('files').find((row) => row.fileId === 'file_0001')).toBeUndefined();
    expect(db.rows('uploadSessions').filter((row) => row.fileId === 'file_0001')).toHaveLength(0);
    expect(db.rows('uploadParts').filter((row) => row.uploadSessionId === 'upl_0001')).toHaveLength(0);
    expect(db.rows('uploadParts').filter((row) => row.uploadSessionId === 'upl_0002')).toHaveLength(0);

    expect(abortedMultipart).toEqual([{ key: 'tmp/multipart-key', target: 'durable', uploadId: 'mp_0001' }]);
    expect(deletedKeys).toContain('tmp/session-key.part1');
    expect(deletedKeys).toContain('artifact/storage-key');
    expect(deletedKeys).toContain('unique/storage-key');
    expect(deletedKeys).not.toContain('shared/storage-key');
    expect(quotaDeltas).toEqual([{ principalId: 'user_123', tenantId: 'org_123', bytes: -25 }]);
  });

  it('TV-DELETE-CASCADE-NEG-001: deleting one of two files with a shared key does not physically delete shared storage', async () => {
    const db = createDb({
      files: [
        {
          fileId: 'file_0001',
          currentVersionId: 'ver_0001',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 100,
          name: 'one.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
        {
          fileId: 'file_0002',
          currentVersionId: 'ver_0002',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'user-avatar',
          mimeType: 'image/png',
          size: 100,
          name: 'two.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      fileVersions: [
        {
          versionId: 'ver_0001',
          fileId: 'file_0001',
          storageKey: 'shared/storage-key',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
        {
          versionId: 'ver_0002',
          fileId: 'file_0002',
          storageKey: 'shared/storage-key',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      filePermissions: [],
      fileShares: [],
      fileArtifacts: [],
      uploadSessions: [],
      uploadParts: [],
    });

    const deletedKeys: string[] = [];
    const quotaDeltas: Array<{ principalId?: string; tenantId?: string; bytes: number }> = [];

    const service = createFileService({
      db: db.adapter,
      storage: {
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async deleteObject(input: { key: string }) {
          deletedKeys.push(input.key);
        },
      } as any,
      events: createEventEmitter(),
      quota: {
        async checkQuota() {
          return { allowed: true, current: 0, limit: Number.MAX_SAFE_INTEGER };
        },
        async recordUsage(input) {
          quotaDeltas.push(input);
        },
      },
      namespace: 'filefn',
    });

    await service.deleteFile('file_0001', {
      principalId: 'user_123',
      tenantId: 'org_123',
      requestId: 'req_delete_002',
    });

    expect(deletedKeys).toEqual([]);
    expect(quotaDeltas).toEqual([]);
    expect(db.rows('files').map((row) => row.fileId)).toEqual(['file_0002']);
  });

  it('TV-STORAGE-001: delete treats the same storage key in different logical targets as different physical objects', async () => {
    const db = createDb({
      files: [
        {
          fileId: 'file_durable',
          currentVersionId: 'ver_durable',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'durable-policy',
          mimeType: 'image/png',
          size: 100,
          name: 'one.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
        {
          fileId: 'file_temporary',
          currentVersionId: 'ver_temporary',
          ownerId: 'user_123',
          tenantId: 'org_123',
          visibility: 'private',
          policy: 'temporary-policy',
          mimeType: 'image/png',
          size: 100,
          name: 'two.png',
          metadata: {},
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
      ],
      fileVersions: [
        {
          versionId: 'ver_durable',
          fileId: 'file_durable',
          storageKey: 'shared/object.png',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
        {
          versionId: 'ver_temporary',
          fileId: 'file_temporary',
          storageKey: 'shared/object.png',
          mimeType: 'image/png',
          size: 100,
          checksumSha256Base64: null,
          createdAt: '2026-03-20T12:00:00.000Z',
        },
      ],
    });

    const deleteCalls: string[] = [];
    function makeAdapter(name: string): StorageAdapter {
      const capabilities: StorageAdapterCapabilities = {
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: true,
        proxyStreamingDownload: true,
      };
      return {
        name,
        capabilities,
        async statObject({ key }) {
          return { key, size: 100 };
        },
        async deleteObject({ key }) {
          deleteCalls.push(`${name}:${key}`);
        },
        async createMultipartUpload() {
          return { uploadId: `${name}-upload` };
        },
        async signMultipartUploadPartUrl({ key, partNumber }) {
          return { url: `https://${name}.local/${key}/${partNumber}` };
        },
        async completeMultipartUpload() {},
        async abortMultipartUpload() {},
        async signDownloadUrl({ key }) {
          return { url: `https://${name}.local/${key}` };
        },
        async openUploadStream() {
          return new WritableStream();
        },
        async openDownloadStream() {
          return new ReadableStream();
        },
      };
    }

    const service = createFileService({
      db: db.adapter,
      storage: createRoutedStorageAdapter({
        adapters: {
          durable: makeAdapter('durable-bucket'),
          temporary: makeAdapter('temporary-bucket'),
        },
      }),
      policies: createPolicyRegistry([
        { name: 'durable-policy', storageTarget: 'durable' },
        { name: 'temporary-policy', storageTarget: 'temporary' },
      ]),
      events: createEventEmitter(),
      namespace: 'filefn',
    });

    await service.deleteFile('file_durable', { principalId: 'user_123', tenantId: 'org_123' });
    expect(deleteCalls).toContain('durable-bucket:shared/object.png');
    expect(deleteCalls).not.toContain('temporary-bucket:shared/object.png');

    await service.deleteFile('file_temporary', { principalId: 'user_123', tenantId: 'org_123' });
    expect(deleteCalls).toContain('temporary-bucket:shared/object.png');
  });
});
