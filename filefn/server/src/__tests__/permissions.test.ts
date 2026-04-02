import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  composeAuthorizers,
  createDefaultAuthorizer,
  createGrantsService,
  type FilePermissionRecord,
} from '../index.js';
import { createUploadSessionService } from '../upload-sessions/service.js';
import type { FileRecord, Authorizer } from '../files/service.js';
import type { Adapter, AdapterCapabilities } from '@superfunctions/db';
import type { FileProviderContext } from '@superfunctions/files';
import { createFakeStorageAdapter } from '@superfunctions/storage';

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
      const id = params.data.permissionId || params.data.fileId || `id_${idCounter++}`;
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

function createMockFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    fileId: 'file_123',
    name: 'test.png',
    mimeType: 'image/png',
    size: 1000,
    ownerId: 'user_123',
    tenantId: null,
    visibility: 'private',
    policy: 'user-avatar',
    currentVersionId: 'ver_123',
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockAuthorizer(allow: boolean): Authorizer {
  return {
    async canRead() { return allow; },
    async canWrite() { return allow; },
    async canDelete() { return allow; },
  };
}

describe('@filefn/server permissions', () => {
  let db: Adapter;

  beforeEach(() => {
    db = createFakeDbAdapter();
  });

  describe('TV-AUTHZ-COMPOSE-001: composeAuthorizers with first-allow strategy', () => {
    it('should return allow if any authorizer allows', async () => {
      const denyAuth = createMockAuthorizer(false);
      const allowAuth = createMockAuthorizer(true);

      // Uses audited spec signature: composeAuthorizers([a, b], { strategy: 'first-allow' })
      const composed = composeAuthorizers([denyAuth, allowAuth], { strategy: 'first-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'other_user' };

      expect(await composed.canRead(file, ctx)).toBe(true);
      expect(await composed.canWrite(file, ctx)).toBe(true);
      expect(await composed.canDelete(file, ctx)).toBe(true);
    });

    it('should return deny if all authorizers deny', async () => {
      const denyAuth1 = createMockAuthorizer(false);
      const denyAuth2 = createMockAuthorizer(false);

      const composed = composeAuthorizers([denyAuth1, denyAuth2], { strategy: 'first-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'other_user' };

      expect(await composed.canRead(file, ctx)).toBe(false);
    });
  });

  describe('TV-AUTHZ-COMPOSE-NEG-001: composeAuthorizers with all-must-allow strategy', () => {
    it('should deny if any authorizer denies', async () => {
      const allowAuth = createMockAuthorizer(true);
      const denyAuth = createMockAuthorizer(false);

      // Uses audited spec signature: composeAuthorizers([a, b], { strategy: 'all-must-allow' })
      const composed = composeAuthorizers([allowAuth, denyAuth], { strategy: 'all-must-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'other_user' };

      expect(await composed.canRead(file, ctx)).toBe(false);
      expect(await composed.canWrite(file, ctx)).toBe(false);
      expect(await composed.canDelete(file, ctx)).toBe(false);
    });

    it('should allow if all authorizers allow', async () => {
      const allowAuth1 = createMockAuthorizer(true);
      const allowAuth2 = createMockAuthorizer(true);

      const composed = composeAuthorizers([allowAuth1, allowAuth2], { strategy: 'all-must-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'other_user' };

      expect(await composed.canRead(file, ctx)).toBe(true);
    });
  });

  describe('TV-PERM-GRANT-001: Create permission grant and authorizer respects it', () => {
    it('should allow access when valid grant exists', async () => {
      const file = createMockFile({ fileId: 'file_456', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      await grantsService.createGrant(
        {
          fileId: 'file_456',
          userId: 'grantee_user',
          canRead: true,
          canWrite: true,
          canDelete: false,
        },
        { principalId: 'owner_user' }
      );

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'grantee_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(true);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('TV-PERM-GRANT-NEG-001: Expired grant is ignored', () => {
    it('should deny access when grant is expired', async () => {
      const file = createMockFile({ fileId: 'file_789', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const expiredGrant: FilePermissionRecord = {
        permissionId: 'perm_expired',
        fileId: 'file_789',
        userId: 'grantee_user',
        role: null,
        tenantId: null,
        canRead: true,
        canWrite: true,
        canDelete: true,
        canShare: false,
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      await db.create({
        model: 'filePermissions',
        data: expiredGrant,
        namespace: 'filefn',
      });

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'grantee_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(false);
      expect(await authorizer.canWrite(file, ctx)).toBe(false);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('TV-PERM-GRANT-NEG-002: Malformed grant expiry is ignored', () => {
    it('should deny access when expiresAt is invalid', async () => {
      const file = createMockFile({ fileId: 'file_invalid_expiry', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const invalidGrant: FilePermissionRecord = {
        permissionId: 'perm_invalid_expiry',
        fileId: 'file_invalid_expiry',
        userId: 'grantee_user',
        role: null,
        tenantId: null,
        canRead: true,
        canWrite: true,
        canDelete: false,
        canShare: false,
        expiresAt: 'not-a-timestamp',
        createdAt: new Date().toISOString(),
      };

      await db.create({
        model: 'filePermissions',
        data: invalidGrant,
        namespace: 'filefn',
      });

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'grantee_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(false);
      expect(await authorizer.canWrite(file, ctx)).toBe(false);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('TV-VISIBILITY-001: Public file is readable without grants', () => {
    it('should allow read access to public files', async () => {
      const file = createMockFile({
        fileId: 'file_public',
        ownerId: 'owner_user',
        visibility: 'public',
      });

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'random_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(false);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('TV-VISIBILITY-NEG-001: Private file without grant is denied', () => {
    it('should deny access to private file without grant', async () => {
      const file = createMockFile({
        fileId: 'file_private',
        ownerId: 'owner_user',
        visibility: 'private',
      });

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'random_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(false);
      expect(await authorizer.canWrite(file, ctx)).toBe(false);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('createDefaultAuthorizer', () => {
    it('should allow owner full access', async () => {
      const file = createMockFile({ ownerId: 'owner_user' });
      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'owner_user' };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(true);
      expect(await authorizer.canDelete(file, ctx)).toBe(true);
    });

    it('should allow admin full access', async () => {
      const file = createMockFile({ ownerId: 'owner_user' });
      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn', adminRoles: ['admin'] });
      const ctx = { principalId: 'admin_user', roles: ['admin'] };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(true);
      expect(await authorizer.canDelete(file, ctx)).toBe(true);
    });

    it('should allow read for shared visibility within tenant', async () => {
      const file = createMockFile({
        ownerId: 'owner_user',
        visibility: 'shared',
        tenantId: 'org_123',
      });
      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'coworker', tenantId: 'org_123' };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(false);
    });

    it('should respect role-based grants', async () => {
      const file = createMockFile({ fileId: 'file_role', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const roleGrant: FilePermissionRecord = {
        permissionId: 'perm_role',
        fileId: 'file_role',
        userId: null,
        role: 'editor',
        tenantId: null,
        canRead: true,
        canWrite: true,
        canDelete: false,
        canShare: false,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      };

      await db.create({
        model: 'filePermissions',
        data: roleGrant,
        namespace: 'filefn',
      });

      const authorizer = createDefaultAuthorizer({ db, namespace: 'filefn' });
      const ctx = { principalId: 'editor_user', roles: ['editor'] };

      expect(await authorizer.canRead(file, ctx)).toBe(true);
      expect(await authorizer.canWrite(file, ctx)).toBe(true);
      expect(await authorizer.canDelete(file, ctx)).toBe(false);
    });
  });

  describe('GrantsService', () => {
    it('should create grant for file owner', async () => {
      const file = createMockFile({ fileId: 'file_grant', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      const grant = await grantsService.createGrant(
        {
          fileId: 'file_grant',
          userId: 'grantee_user',
          canRead: true,
        },
        { principalId: 'owner_user' }
      );

      expect(grant.permissionId).toBeDefined();
      expect(grant.fileId).toBe('file_grant');
      expect(grant.userId).toBe('grantee_user');
      expect(grant.canRead).toBe(true);
    });

    it('should list grants for file owner', async () => {
      const file = createMockFile({ fileId: 'file_list', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      await grantsService.createGrant(
        { fileId: 'file_list', userId: 'user1', canRead: true },
        { principalId: 'owner_user' }
      );
      await grantsService.createGrant(
        { fileId: 'file_list', userId: 'user2', canRead: true },
        { principalId: 'owner_user' }
      );

      const grants = await grantsService.listGrants('file_list', { principalId: 'owner_user' });

      expect(grants.length).toBe(2);
    });

    it('should revoke grant for file owner', async () => {
      const file = createMockFile({ fileId: 'file_revoke', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      const grant = await grantsService.createGrant(
        { fileId: 'file_revoke', userId: 'grantee_user', canRead: true },
        { principalId: 'owner_user' }
      );

      await grantsService.revokeGrant('file_revoke', grant.permissionId, { principalId: 'owner_user' });

      const grants = await grantsService.listGrants('file_revoke', { principalId: 'owner_user' });
      expect(grants.length).toBe(0);
    });

    it('should deny grant creation for non-owner', async () => {
      const file = createMockFile({ fileId: 'file_deny', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      await expect(
        grantsService.createGrant(
          { fileId: 'file_deny', userId: 'grantee_user', canRead: true },
          { principalId: 'other_user' }
        )
      ).rejects.toMatchObject({ code: 'FILEFN_FORBIDDEN' });
    });

    it('should require at least one target (userId, role, or tenantId)', async () => {
      const file = createMockFile({ fileId: 'file_target', ownerId: 'owner_user' });

      await db.create({
        model: 'files',
        data: file,
        namespace: 'filefn',
      });

      const grantsService = createGrantsService({ db, namespace: 'filefn' });

      await expect(
        grantsService.createGrant(
          { fileId: 'file_target', canRead: true },
          { principalId: 'owner_user' }
        )
      ).rejects.toMatchObject({ code: 'FILEFN_INVALID_GRANT' });
    });
  });

  describe('TV-AUTH-002: Replace completion re-checks authorization', () => {
    it('should reject replacement completion after write access is revoked', async () => {
      const storageSizes = new Map<string, number>();
      const canWriteState = { current: true };
      const storage = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: false,
          proxyStreamingDownload: true,
        },
        async createMultipartUpload() {
          return { uploadId: 'up_replace_1' };
        },
        async completeMultipartUpload() {},
        async signMultipartUploadPartUrl() {
          return { url: 'https://signed.example/upload', headers: {} };
        },
        async statObject(input) {
          return { key: input.key, size: storageSizes.get(input.key) ?? 1000 };
        },
      });

      await db.create({
        model: 'files',
        data: createMockFile({ fileId: 'file_replace', ownerId: 'user_123', currentVersionId: 'ver_old' }),
        namespace: 'filefn',
      });

      const service = createUploadSessionService({
        db,
        storage,
        policies: {
          get: vi.fn(() => ({
            visibility: 'private',
            contentTypes: ['image/png'],
            maxSizeBytes: 10 * 1024 * 1024,
          })),
        } as any,
        events: { emit: vi.fn() } as any,
        fileWriteChecker: {
          async canWriteFile() {
            return canWriteState.current;
          },
        },
        namespace: 'filefn',
      });

      const ctx: FileProviderContext = { principalId: 'user_123', requestId: 'req_replace_auth_001' };
      const { uploadSessionId } = await service.createSession(
        {
          policy: 'user-avatar',
          fileName: 'avatar.png',
          size: 1000,
          mimeType: 'image/png',
          fileId: 'file_replace',
        },
        ctx,
      );

      const session = await db.findOne<any>({
        model: 'uploadSessions',
        where: [{ field: 'uploadSessionId', operator: 'eq', value: uploadSessionId }],
        namespace: 'filefn',
      });
      storageSizes.set(session.storageKey, 1000);

      await service.completePart(uploadSessionId, 1, 'etag_replace_1', 1000, ctx);
      canWriteState.current = false;

      await expect(service.completeSession(uploadSessionId, ctx)).rejects.toMatchObject({
        code: 'FILEFN_FORBIDDEN',
      });
    });
  });

  describe('composeAuthorizers edge cases', () => {
    it('should return deny-all for empty authorizers list', async () => {
      const composed = composeAuthorizers([], { strategy: 'first-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'any_user' };

      expect(await composed.canRead(file, ctx)).toBe(false);
      expect(await composed.canWrite(file, ctx)).toBe(false);
      expect(await composed.canDelete(file, ctx)).toBe(false);
    });

    it('should work with single authorizer', async () => {
      const allowAuth = createMockAuthorizer(true);

      const composed = composeAuthorizers([allowAuth], { strategy: 'first-allow' });

      const file = createMockFile();
      const ctx: FileProviderContext = { principalId: 'any_user' };

      expect(await composed.canRead(file, ctx)).toBe(true);
    });
  });
});
