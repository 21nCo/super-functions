import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalStorageAdapter } from './adapter.js';
import { runConformanceTests, validateCapabilities } from '@superfunctions/storage';

describe('@superfunctions/storage-local', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `storage-local-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Adapter instantiation (STORAGE-001)', () => {
    it('should create adapter with correct name', () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      expect(adapter.name).toBe('local');
    });

    it('should be stateless - factory returns immutable instance', () => {
      const adapter1 = createLocalStorageAdapter({ rootDir: testDir });
      const adapter2 = createLocalStorageAdapter({ rootDir: testDir });
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('Capabilities (STORAGE-002)', () => {
    it('should declare accurate capabilities for local storage', () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      expect(adapter.capabilities).toEqual({
        signedUploadUrls: false,
        signedDownloadUrls: false,
        multipart: false,
        proxyStreamingUpload: true,
        proxyStreamingDownload: true,
      });
    });

    it('should pass capability validation', () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const result = validateCapabilities(adapter.capabilities);
      expect(result.ok).toBe(true);
    });
  });

  describe('Conformance tests', () => {
    it('should pass all conformance tests', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('statObject (STORAGE-003)', () => {
    it('should return file stats for existing file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'hello world');

      const stat = await adapter.statObject({ key: 'test.txt' });
      expect(stat.key).toBe('test.txt');
      expect(stat.size).toBe(11);
      expect(stat.lastModifiedAt).toBeDefined();
    });

    it('should throw STORAGE_NOT_FOUND for missing file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: 'missing.txt' })).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND',
      });
    });

    it('should throw STORAGE_NOT_FOUND for directories', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await mkdir(join(testDir, 'subdir'));

      await expect(adapter.statObject({ key: 'subdir' })).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND',
      });
    });
  });

  describe('deleteObject (STORAGE-003)', () => {
    it('should delete existing file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'hello');

      await adapter.deleteObject({ key: 'test.txt' });

      await expect(adapter.statObject({ key: 'test.txt' })).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND',
      });
    });

    it('should be idempotent - not throw for missing file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await expect(adapter.deleteObject({ key: 'missing.txt' })).resolves.toBeUndefined();
      await expect(adapter.deleteObject({ key: 'missing.txt' })).resolves.toBeUndefined();
    });
  });

  describe('openUploadStream', () => {
    it('should write data to file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const stream = await adapter.openUploadStream!({ key: 'upload.txt' });
      const writer = stream.getWriter();

      await writer.write(new TextEncoder().encode('hello '));
      await writer.write(new TextEncoder().encode('world'));
      await writer.close();

      const content = await readFile(join(testDir, 'upload.txt'), 'utf-8');
      expect(content).toBe('hello world');
    });

    it('should create nested directories', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const stream = await adapter.openUploadStream!({ key: 'a/b/c/file.txt' });
      const writer = stream.getWriter();

      await writer.write(new TextEncoder().encode('nested'));
      await writer.close();

      const content = await readFile(join(testDir, 'a/b/c/file.txt'), 'utf-8');
      expect(content).toBe('nested');
    });
  });

  describe('openDownloadStream', () => {
    it('should read data from file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'download.txt'), 'hello world');

      const stream = await adapter.openDownloadStream!({ key: 'download.txt' });
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const content = new TextDecoder().decode(Buffer.concat(chunks));
      expect(content).toBe('hello world');
    });

    it('should support range requests - middle of file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), '0123456789');

      const stream = await adapter.openDownloadStream!({
        key: 'range.txt',
        range: { start: 2, endInclusive: 5 },
      });
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const content = new TextDecoder().decode(Buffer.concat(chunks));
      expect(content).toBe('2345');
    });

    it('should support range requests - from start', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), 'ABCDEFGHIJ');

      const stream = await adapter.openDownloadStream!({
        key: 'range.txt',
        range: { start: 0, endInclusive: 4 },
      });
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const content = new TextDecoder().decode(Buffer.concat(chunks));
      expect(content).toBe('ABCDE');
    });

    it('should support range requests - to end', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), 'ABCDEFGHIJ');

      const stream = await adapter.openDownloadStream!({
        key: 'range.txt',
        range: { start: 5, endInclusive: 9 },
      });
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const content = new TextDecoder().decode(Buffer.concat(chunks));
      expect(content).toBe('FGHIJ');
    });

    it('should throw STORAGE_NOT_FOUND for missing file', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.openDownloadStream!({ key: 'missing.txt' })).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND',
      });
    });

    it('should reject invalid range - negative start', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), '0123456789');

      await expect(
        adapter.openDownloadStream!({
          key: 'range.txt',
          range: { start: -1, endInclusive: 5 },
        })
      ).rejects.toThrow('Invalid range');
    });

    it('should reject invalid range - end before start', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), '0123456789');

      await expect(
        adapter.openDownloadStream!({
          key: 'range.txt',
          range: { start: 5, endInclusive: 2 },
        })
      ).rejects.toThrow('Invalid range');
    });

    it('should reject invalid range - start beyond file size', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      await writeFile(join(testDir, 'range.txt'), '0123456789');

      await expect(
        adapter.openDownloadStream!({
          key: 'range.txt',
          range: { start: 100, endInclusive: 200 },
        })
      ).rejects.toThrow('Invalid range');
    });
  });

  describe('Security - Path traversal prevention', () => {
    it('should prevent path traversal with ../', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: '../../../etc/passwd' })).rejects.toThrow(
        'path traversal'
      );
    });

    it('should prevent path traversal with ..\\', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: '..\\..\\etc\\passwd' })).rejects.toThrow(
        'path traversal'
      );
    });

    it('should prevent absolute paths', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: '/etc/passwd' })).rejects.toThrow('absolute paths');
    });

    it('should prevent empty keys', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: '' })).rejects.toThrow('cannot be empty');
    });

    it('should prevent null bytes in key', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      await expect(adapter.statObject({ key: 'test\0.txt' })).rejects.toThrow('forbidden character');
    });

    it('should prevent traversal via symlink', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });

      const outsideDir = join(tmpdir(), `outside-${Date.now()}`);
      await mkdir(outsideDir, { recursive: true });
      await writeFile(join(outsideDir, 'secret.txt'), 'secret data');

      try {
        await symlink(outsideDir, join(testDir, 'link'));

        await expect(adapter.statObject({ key: 'link/secret.txt' })).rejects.toThrow(
          'path traversal'
        );
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });

    it('should allow safe nested paths', async () => {
      const adapter = createLocalStorageAdapter({ rootDir: testDir });
      const nestedPath = join(testDir, 'a', 'b', 'c');
      await mkdir(nestedPath, { recursive: true });
      await writeFile(join(nestedPath, 'file.txt'), 'content');

      const stat = await adapter.statObject({ key: 'a/b/c/file.txt' });
      expect(stat.key).toBe('a/b/c/file.txt');
    });
  });
});
