import { describe, it, expect, beforeEach } from 'vitest';
import { createDeduplicationService } from '../src/dedup/service.js';
import { createFileFn } from '../src/index.js';
import type { Adapter } from '@superfunctions/db';
import { Readable } from 'node:stream';
import { createFakeStorageAdapter } from '@superfunctions/storage';

function createMockDb(): Adapter {
  const storage = new Map<string, Map<string, unknown>>();

  return {
    async create({ model, data, namespace }) {
      const key = `${namespace}:${model}`;
      if (!storage.has(key)) storage.set(key, new Map());
      const id = (data as any).versionId || (data as any).fileId || Math.random().toString();
      storage.get(key)!.set(id, data);
      return data;
    },
    async findOne({ model, where, namespace }) {
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return null;
      for (const record of records.values()) {
        const match = where.every((w: any) => (record as any)[w.field] === w.value);
        if (match) return record as any;
      }
      return null;
    },
    async findMany({ model, namespace }) {
      const key = `${namespace}:${model}`;
      const records = storage.get(key);
      if (!records) return [];
      return Array.from(records.values()) as any[];
    },
    async update() {
      return {} as any;
    },
    async upsert() {
      return {} as any;
    },
    async delete() {},
    async deleteMany() {},
    getDialect() {
      return 'sqlite' as any;
    },
    isReady() {
      return Promise.resolve(true);
    },
    close() {
      return Promise.resolve();
    },
  } as Adapter;
}

function createMockStorage() {
  const objects = new Map<string, Uint8Array>();

  return {
    setData(key: string, data: Uint8Array) {
      objects.set(key, data);
    },
    async openDownloadStream({ key }: { key: string }) {
      const data = objects.get(key);
      if (!data) throw new Error('Not found');
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
  };
}

describe('Deduplication Service', () => {
  let db: Adapter;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
  });

  describe('Hash computation', () => {
    it('should compute SHA-256 hash from Uint8Array', () => {
      const service = createDeduplicationService({ db, enabled: true });
      const data = new TextEncoder().encode('Hello, World!');
      const hash = service.computeHash(data);

      expect(hash).toBe('3/1gIbsr1bCvZ2KQgJ7DpTGR3YHH9wpLKGiKNiGCmG8=');
    });

    it('should compute same hash for identical data', () => {
      const service = createDeduplicationService({ db, enabled: true });
      const data1 = new TextEncoder().encode('Test content');
      const data2 = new TextEncoder().encode('Test content');

      const hash1 = service.computeHash(data1);
      const hash2 = service.computeHash(data2);

      expect(hash1).toBe(hash2);
    });

    it('should compute different hashes for different data', () => {
      const service = createDeduplicationService({ db, enabled: true });
      const data1 = new TextEncoder().encode('Content A');
      const data2 = new TextEncoder().encode('Content B');

      const hash1 = service.computeHash(data1);
      const hash2 = service.computeHash(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should compute hash from readable stream', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const data = new TextEncoder().encode('Stream content');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const hash = await service.computeHashFromStream(stream);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('TV-DEDUP-001: Deduplicate identical content within tenant', () => {
    it('should detect duplicate content in same tenant', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const tenantId = 'org_123';
      const content = new TextEncoder().encode('Duplicate content');
      const hash = service.computeHash(content);

      // Create first version with this hash
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'org_123/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check for duplicate
      const result = await service.checkForDuplicate(hash, tenantId);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingVersionId).toBe('ver_001');
      expect(result.existingStorageKey).toBe('org_123/file_001/ver_001.txt');
      expect(result.checksumSha256Base64).toBe(hash);
    });

    it('should not detect duplicate for different content', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const tenantId = 'org_123';
      const content1 = new TextEncoder().encode('Content A');
      const content2 = new TextEncoder().encode('Content B');
      const hash1 = service.computeHash(content1);
      const hash2 = service.computeHash(content2);

      // Create first version
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'org_123/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content1.length,
          checksumSha256Base64: hash1,
          tenantId,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check for duplicate with different hash
      const result = await service.checkForDuplicate(hash2, tenantId);

      expect(result.isDuplicate).toBe(false);
      expect(result.existingVersionId).toBeUndefined();
      expect(result.checksumSha256Base64).toBe(hash2);
    });

    it('should compute and check duplicate from storage', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const tenantId = 'org_123';
      const content = new TextEncoder().encode('Storage content');
      const hash = service.computeHash(content);

      // Store content
      storage.setData('org_123/file_001/ver_001.txt', content);

      // Create first version
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'org_123/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Store duplicate content with different key
      storage.setData('org_123/file_002/ver_002.txt', content);

      // Check for duplicate from storage
      const result = await service.computeAndCheckDuplicate(
        'org_123/file_002/ver_002.txt',
        tenantId,
        storage
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.existingVersionId).toBe('ver_001');
      expect(result.existingStorageKey).toBe('org_123/file_001/ver_001.txt');
    });
  });

  describe('TV-DEDUP-NEG-001: Cross-tenant dedupe is forbidden', () => {
    it('should not detect duplicate across different tenants', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const content = new TextEncoder().encode('Same content');
      const hash = service.computeHash(content);

      // Create version in tenant A
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'org_A/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId: 'org_A',
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check for duplicate in tenant B
      const result = await service.checkForDuplicate(hash, 'org_B');

      expect(result.isDuplicate).toBe(false);
      expect(result.existingVersionId).toBeUndefined();
      expect(result.checksumSha256Base64).toBe(hash);
    });

    it('should not deduplicate when tenantIds differ', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const content = new TextEncoder().encode('Content for both tenants');
      const hash = service.computeHash(content);

      // Create version in tenant_1
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'tenant_1/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId: 'tenant_1',
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Create version in tenant_2
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_002',
          fileId: 'file_002',
          storageKey: 'tenant_2/file_002/ver_002.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId: 'tenant_2',
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check for duplicate in tenant_1 - should find ver_001
      const result1 = await service.checkForDuplicate(hash, 'tenant_1');
      expect(result1.isDuplicate).toBe(true);
      expect(result1.existingVersionId).toBe('ver_001');

      // Check for duplicate in tenant_2 - should find ver_002
      const result2 = await service.checkForDuplicate(hash, 'tenant_2');
      expect(result2.isDuplicate).toBe(true);
      expect(result2.existingVersionId).toBe('ver_002');

      // Verify they found different versions (tenant-scoped)
      expect(result1.existingVersionId).not.toBe(result2.existingVersionId);
    });

    it('should handle null tenantId separately', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const content = new TextEncoder().encode('Global content');
      const hash = service.computeHash(content);

      // Create version with null tenantId
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'global/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId: null,
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check for duplicate with null tenantId - should find it
      const resultNull = await service.checkForDuplicate(hash, null);
      expect(resultNull.isDuplicate).toBe(true);
      expect(resultNull.existingVersionId).toBe('ver_001');

      // Check for duplicate with specific tenant - should NOT find it
      const resultTenant = await service.checkForDuplicate(hash, 'org_123');
      expect(resultTenant.isDuplicate).toBe(false);
    });
  });

  describe('Deduplication enabled/disabled', () => {
    it('should return isDuplicate false when dedup is disabled', async () => {
      const service = createDeduplicationService({ db, enabled: false });
      const content = new TextEncoder().encode('Content');
      const hash = service.computeHash(content);

      // Create version (even though dedup is disabled)
      await db.create({
        model: 'fileVersions',
        data: {
          versionId: 'ver_001',
          fileId: 'file_001',
          storageKey: 'org_123/file_001/ver_001.txt',
          mimeType: 'text/plain',
          size: content.length,
          checksumSha256Base64: hash,
          tenantId: 'org_123',
          createdAt: new Date().toISOString(),
        },
        namespace: 'filefn',
      });

      // Check - should always return isDuplicate false
      const result = await service.checkForDuplicate(hash, 'org_123');

      expect(result.isDuplicate).toBe(false);
      expect(result.checksumSha256Base64).toBe(hash);
    });

    it('should check isEnabled() correctly', () => {
      const enabledService = createDeduplicationService({ db, enabled: true });
      const disabledService = createDeduplicationService({ db, enabled: false });

      expect(enabledService.isEnabled()).toBe(true);
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('Hash verification', () => {
    it('should verify hash matches content', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const content = new TextEncoder().encode('Verify me');
      const hash = service.computeHash(content);

      storage.setData('test/verify.txt', content);

      const isValid = await service.verifyHash('test/verify.txt', hash, storage);

      expect(isValid).toBe(true);
    });

    it('should detect hash mismatch', async () => {
      const service = createDeduplicationService({ db, enabled: true });
      const content = new TextEncoder().encode('Original content');
      const wrongHash = service.computeHash(new TextEncoder().encode('Different content'));

      storage.setData('test/verify.txt', content);

      const isValid = await service.verifyHash('test/verify.txt', wrongHash, storage);

      expect(isValid).toBe(false);
    });
  });

  describe('Public dedupe config wiring', () => {
    it('createFileFn uses dedup.enabled to control dedupe behavior', async () => {
      const storage = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: false,
          proxyStreamingDownload: false,
        },
        async statObject(input) {
          return { key: input.key, size: 3 };
        },
      });

      const fileFnWithoutDedup = createFileFn({
        db: createMockDb(),
        storage,
        policies: [{ name: 'user-avatar', contentTypes: ['text/plain'], maxSizeBytes: 1024 }],
        dedup: { enabled: false },
        auth: { required: false },
      });

      const { uploadSessionId: noDedupSessionId } = await fileFnWithoutDedup.createUploadSession(
        { policy: 'user-avatar', fileName: 'a.txt', size: 3, mimeType: 'text/plain' },
        { principalId: 'user_123', tenantId: 'org_123' }
      );
      await fileFnWithoutDedup.completeUploadPart(
        { uploadSessionId: noDedupSessionId, partNumber: 1, etag: 'etag-1', size: 3 },
        { principalId: 'user_123', tenantId: 'org_123' }
      );
      await expect(
        fileFnWithoutDedup.completeUploadSession(
          { uploadSessionId: noDedupSessionId },
          { principalId: 'user_123', tenantId: 'org_123' }
        )
      ).resolves.toMatchObject({ fileId: expect.any(String), versionId: expect.any(String) });

      const fileFnWithDedup = createFileFn({
        db: createMockDb(),
        storage,
        policies: [{ name: 'user-avatar', contentTypes: ['text/plain'], maxSizeBytes: 1024 }],
        dedup: { enabled: true },
        auth: { required: false },
      });

      const { uploadSessionId: dedupSessionId } = await fileFnWithDedup.createUploadSession(
        { policy: 'user-avatar', fileName: 'b.txt', size: 3, mimeType: 'text/plain' },
        { principalId: 'user_123', tenantId: 'org_123' }
      );
      await fileFnWithDedup.completeUploadPart(
        { uploadSessionId: dedupSessionId, partNumber: 1, etag: 'etag-2', size: 3 },
        { principalId: 'user_123', tenantId: 'org_123' }
      );
      await expect(
        fileFnWithDedup.completeUploadSession(
          { uploadSessionId: dedupSessionId },
          { principalId: 'user_123', tenantId: 'org_123' }
        )
      ).rejects.toThrow('streaming downloads required for deduplication');
    });
  });
});
