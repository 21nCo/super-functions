import { describe, it, expect, beforeEach } from 'vitest';
import { createSharesService, type FileShareRecord } from '../index.js';
import type { FileRecord, FileVersionRecord } from '../files/service.js';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';
import type { StorageAdapter } from '@superfunctions/storage';

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
      const id = params.data.tokenHash || params.data.fileId || params.data.versionId || `id_${idCounter++}`;
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
      return results;
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
    async createMany(params) { return []; },
    async updateMany(params) { return 0; },
    async deleteMany(params) { return 0; },
    async upsert(params) {
      const existing = await this.findOne({ model: params.model, where: params.where, namespace: params.namespace });
      if (existing) {
        return await this.update({ model: params.model, where: params.where, data: params.update, namespace: params.namespace });
      }
      return await this.create({ model: params.model, data: params.create, namespace: params.namespace });
    },
    async count(params) { return 0; },
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

function createFakeStorageAdapter(): StorageAdapter {
  return {
    id: 'fake-storage',
    name: 'fake-storage',
    version: '1.0.0',
    capabilities: {
      signedUploadUrls: true,
      signedDownloadUrls: true,
      multipart: true,
      proxyStreamingUpload: false,
      proxyStreamingDownload: true,
    },
    async signDownloadUrl({ key }: { key: string }) {
      return { url: `https://fake-bucket.s3.amazonaws.com/${key}?X-Amz-Signature=fake` };
    },
    async signUploadUrl({ key }: { key: string }) {
      return { url: `https://fake-bucket.s3.amazonaws.com/${key}?X-Amz-Signature=fake` };
    },
    async openDownloadStream() {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
    },
    async put() { return { key: 'test-key', size: 100 }; },
    async get() { return { stream: new ReadableStream(), contentType: 'application/octet-stream', size: 100 }; },
    async delete() {},
    async copy() { return { key: 'copied-key' }; },
    async exists() { return true; },
    async list() { return { objects: [], continuationToken: undefined }; },
    async initialize() {},
    async isHealthy() { return { healthy: true, uptime: 0 }; },
  } as unknown as StorageAdapter;
}

async function seedFileAndVersion(db: Adapter, fileId: string, ownerId: string): Promise<{ file: FileRecord; version: FileVersionRecord }> {
  const file: FileRecord = {
    fileId,
    name: 'test.png',
    mimeType: 'image/png',
    size: 1000,
    ownerId,
    tenantId: null,
    visibility: 'private',
    policy: 'user-avatar',
    currentVersionId: `ver_${fileId}`,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const version: FileVersionRecord = {
    versionId: `ver_${fileId}`,
    fileId,
    storageKey: `files/${fileId}/ver_${fileId}`,
    mimeType: 'image/png',
    size: 1000,
    checksumSha256Base64: null,
    createdAt: new Date().toISOString(),
  };

  await db.create({ model: 'files', data: file, namespace: 'filefn' });
  await db.create({ model: 'fileVersions', data: version, namespace: 'filefn' });

  return { file, version };
}

describe('@filefn/server shares', () => {
  let db: Adapter;
  let storage: StorageAdapter;

  beforeEach(() => {
    db = createFakeDbAdapter();
    storage = createFakeStorageAdapter();
  });

  describe('TV-SHARE-CREATE-001: Create share link returns token once', () => {
    it('should create share link and return plaintext token', async () => {
      await seedFileAndVersion(db, 'file_share', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const result = await sharesService.createShareLink(
        { fileId: 'file_share' },
        { principalId: 'owner_user' }
      );

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(20);
    });

    it('should store token as hash (not plaintext)', async () => {
      await seedFileAndVersion(db, 'file_hash', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const result = await sharesService.createShareLink(
        { fileId: 'file_hash' },
        { principalId: 'owner_user' }
      );

      const shares = await db.findMany<FileShareRecord>({
        model: 'fileShares',
        where: [{ field: 'fileId', operator: 'eq', value: 'file_hash' }],
        namespace: 'filefn',
      });

      expect(shares.length).toBe(1);
      expect(shares[0].tokenHash).toBeDefined();
      expect(shares[0].tokenHash).not.toBe(result.token);
    });
  });

  describe('Download via share link', () => {
    it('should return download URL for valid share', async () => {
      await seedFileAndVersion(db, 'file_download', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_download' },
        { principalId: 'owner_user' }
      );

      const result = await sharesService.downloadViaShareLink(token, {
        principalId: 'anonymous',
        isAuthenticated: false,
      });

      expect(result.url).toBeDefined();
      expect(result.fileName).toBe('test.png');
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('TV-SHARE-DOWNLOAD-NEG-001: Expired share fails', () => {
    it('should fail with FILEFN_SHARE_EXPIRED for expired share', async () => {
      await seedFileAndVersion(db, 'file_expired', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        {
          fileId: 'file_expired',
          expiresAt: new Date(Date.now() - 10000).toISOString(),
        },
        { principalId: 'owner_user' }
      );

      await expect(
        sharesService.downloadViaShareLink(token, { principalId: 'anonymous' })
      ).rejects.toMatchObject({ code: 'FILEFN_SHARE_EXPIRED' });
    });
  });

  describe('Revoked share fails', () => {
    it('should fail with FILEFN_SHARE_REVOKED for revoked share', async () => {
      await seedFileAndVersion(db, 'file_revoked', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_revoked' },
        { principalId: 'owner_user' }
      );

      await sharesService.revokeShareLink('file_revoked', token, { principalId: 'owner_user' });

      await expect(
        sharesService.downloadViaShareLink(token, { principalId: 'anonymous' })
      ).rejects.toMatchObject({ code: 'FILEFN_SHARE_REVOKED' });
    });
  });

  describe('Max downloads exceeded fails', () => {
    it('should fail with FILEFN_SHARE_DOWNLOADS_EXCEEDED after max downloads', async () => {
      await seedFileAndVersion(db, 'file_max', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_max', maxDownloads: 2 },
        { principalId: 'owner_user' }
      );

      await sharesService.downloadViaShareLink(token, { principalId: 'user1' });
      await sharesService.downloadViaShareLink(token, { principalId: 'user2' });

      await expect(
        sharesService.downloadViaShareLink(token, { principalId: 'user3' })
      ).rejects.toMatchObject({ code: 'FILEFN_SHARE_DOWNLOADS_EXCEEDED' });
    });
  });

  describe('requiresAuth enforcement', () => {
    it('should fail with FILEFN_AUTH_REQUIRED when requiresAuth=true and not authenticated', async () => {
      await seedFileAndVersion(db, 'file_auth', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_auth', requiresAuth: true },
        { principalId: 'owner_user' }
      );

      await expect(
        sharesService.downloadViaShareLink(token, {
          principalId: 'anonymous',
          isAuthenticated: false,
        })
      ).rejects.toMatchObject({ code: 'FILEFN_AUTH_REQUIRED' });
    });

    it('should allow download when requiresAuth=true and authenticated', async () => {
      await seedFileAndVersion(db, 'file_auth_ok', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_auth_ok', requiresAuth: true },
        { principalId: 'owner_user' }
      );

      const result = await sharesService.downloadViaShareLink(token, {
        principalId: 'authenticated_user',
        isAuthenticated: true,
      });

      expect(result.url).toBeDefined();
    });
  });

  describe('Share link not found', () => {
    it('should fail with FILEFN_SHARE_NOT_FOUND for invalid token', async () => {
      await seedFileAndVersion(db, 'file_notfound', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await expect(
        sharesService.downloadViaShareLink('invalid_token_abc123', { principalId: 'anonymous' })
      ).rejects.toMatchObject({ code: 'FILEFN_SHARE_NOT_FOUND' });
    });
  });

  describe('listShareLinks', () => {
    it('should list share links for file owner', async () => {
      await seedFileAndVersion(db, 'file_list', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await sharesService.createShareLink({ fileId: 'file_list' }, { principalId: 'owner_user' });
      await sharesService.createShareLink({ fileId: 'file_list' }, { principalId: 'owner_user' });

      const shares = await sharesService.listShareLinks('file_list', { principalId: 'owner_user' });

      expect(shares.length).toBe(2);
      expect(shares[0].tokenHashPrefix).toBeDefined();
      expect(shares[0].tokenHashPrefix.length).toBe(8);
    });

    it('should deny listing for non-owner', async () => {
      await seedFileAndVersion(db, 'file_list_deny', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await expect(
        sharesService.listShareLinks('file_list_deny', { principalId: 'other_user' })
      ).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
    });
  });

  describe('revokeShareLink', () => {
    it('should deny revocation for non-owner', async () => {
      await seedFileAndVersion(db, 'file_revoke_deny', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_revoke_deny' },
        { principalId: 'owner_user' }
      );

      await expect(
        sharesService.revokeShareLink('file_revoke_deny', token, { principalId: 'other_user' })
      ).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
    });

    it('should fail for non-existent token', async () => {
      await seedFileAndVersion(db, 'file_revoke_404', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await expect(
        sharesService.revokeShareLink('file_revoke_404', 'invalid_token', { principalId: 'owner_user' })
      ).rejects.toMatchObject({ code: 'FILEFN_SHARE_NOT_FOUND' });
    });
  });

  describe('createShareLink', () => {
    it('should deny creation for non-owner', async () => {
      await seedFileAndVersion(db, 'file_create_deny', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await expect(
        sharesService.createShareLink({ fileId: 'file_create_deny' }, { principalId: 'other_user' })
      ).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
    });

    it('should fail for non-existent file', async () => {
      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      await expect(
        sharesService.createShareLink({ fileId: 'non_existent' }, { principalId: 'any_user' })
      ).rejects.toMatchObject({ code: 'FILEFN_NOT_FOUND' });
    });

    it('should support version-specific share links', async () => {
      await seedFileAndVersion(db, 'file_version', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_version', versionId: 'ver_file_version' },
        { principalId: 'owner_user' }
      );

      expect(token).toBeDefined();

      const shares = await db.findMany<FileShareRecord>({
        model: 'fileShares',
        where: [{ field: 'fileId', operator: 'eq', value: 'file_version' }],
        namespace: 'filefn',
      });

      expect(shares[0].versionId).toBe('ver_file_version');
    });

    it('should support expiresAt configuration', async () => {
      await seedFileAndVersion(db, 'file_expires', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      const result = await sharesService.createShareLink(
        { fileId: 'file_expires', expiresAt },
        { principalId: 'owner_user' }
      );

      expect(result.expiresAt).toBe(expiresAt);
    });

    it('should allow delegated canShare grants to create share links', async () => {
      await seedFileAndVersion(db, 'file_delegate', 'owner_user');
      await db.create({
        model: 'filePermissions',
        data: {
          permissionId: 'perm_delegate',
          fileId: 'file_delegate',
          userId: 'delegate_user',
          role: null,
          tenantId: null,
          canRead: true,
          canWrite: false,
          canDelete: false,
          canShare: true,
          expiresAt: null,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });
      const result = await sharesService.createShareLink(
        { fileId: 'file_delegate' },
        { principalId: 'delegate_user' },
      );

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });
  });

  describe('Download increments counter', () => {
    it('should increment download count on each download', async () => {
      await seedFileAndVersion(db, 'file_count', 'owner_user');

      const sharesService = createSharesService({ db, storage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_count' },
        { principalId: 'owner_user' }
      );

      await sharesService.downloadViaShareLink(token, { principalId: 'user1' });
      await sharesService.downloadViaShareLink(token, { principalId: 'user2' });

      const shares = await db.findMany<FileShareRecord>({
        model: 'fileShares',
        where: [{ field: 'fileId', operator: 'eq', value: 'file_count' }],
        namespace: 'filefn',
      });

      expect(shares[0].downloads).toBe(2);
    });

    it('should defer counter increment for proxy descriptors until proxy stream starts', async () => {
      await seedFileAndVersion(db, 'file_proxy_count', 'owner_user');

      const proxyOnlyStorage = createFakeStorageAdapter();
      (proxyOnlyStorage.capabilities as any).signedDownloadUrls = false;

      const sharesService = createSharesService({ db, storage: proxyOnlyStorage, namespace: 'filefn' });

      const { token } = await sharesService.createShareLink(
        { fileId: 'file_proxy_count' },
        { principalId: 'owner_user' },
      );

      const descriptor = await sharesService.downloadViaShareLink(token, {
        principalId: 'anonymous',
        isAuthenticated: false,
      });
      expect(descriptor.url).toMatch(/^\/proxy\/share-links\//);

      let shares = await db.findMany<FileShareRecord>({
        model: 'fileShares',
        where: [{ field: 'fileId', operator: 'eq', value: 'file_proxy_count' }],
        namespace: 'filefn',
      });
      expect(shares[0].downloads).toBe(0);

      const streamResult = await sharesService.getDownloadStreamViaShareLink(token, {
        principalId: 'anonymous',
        isAuthenticated: false,
      });
      expect(streamResult.contentType).toBe('image/png');

      shares = await db.findMany<FileShareRecord>({
        model: 'fileShares',
        where: [{ field: 'fileId', operator: 'eq', value: 'file_proxy_count' }],
        namespace: 'filefn',
      });
      expect(shares[0].downloads).toBe(1);
    });
  });
});
