import { describe, it, expect } from 'vitest';
import {
  runConformanceTests,
  validateCapabilities,
  createFakeStorageAdapter,
} from './conformance.js';
import type { StorageAdapter, StorageAdapterCapabilities } from './types.js';

describe('storage conformance', () => {
  describe('runConformanceTests', () => {
    it('should pass for a valid adapter with all capabilities', async () => {
      const adapter = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
      });

      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
      expect(result.passed.length).toBeGreaterThan(0);
      expect(result.failed.length).toBe(0);
    });

    it('should pass for a minimal adapter with proxy streaming only', async () => {
      const adapter = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: false,
          signedDownloadUrls: false,
          multipart: false,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
      });

      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
    });

    it('should fail when multipart capability is true but methods are missing (TV-STORAGE-ADAPTERS-NEG-001)', async () => {
      const adapter: StorageAdapter = {
        name: 'broken',
        capabilities: {
          signedUploadUrls: false,
          signedDownloadUrls: false,
          multipart: true, // claims multipart but no methods
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async statObject(input) {
          return { key: input.key, size: 1024 };
        },
        async deleteObject(_input) {},
        async openUploadStream(_input) {
          return new WritableStream();
        },
        async openDownloadStream(_input) {
          return new ReadableStream();
        },
      };

      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ADAPTER_CONFORMANCE_FAILED');
      expect(result.error?.message).toContain('multipart capability requires createMultipartUpload');
    });

    it('should fail when signedUploadUrls capability is true but method is missing', async () => {
      const adapter: StorageAdapter = {
        name: 'broken',
        capabilities: {
          signedUploadUrls: true, // claims signed URLs but no method
          signedDownloadUrls: false,
          multipart: false,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async statObject(input) {
          return { key: input.key, size: 1024 };
        },
        async deleteObject(_input) {},
        async openUploadStream(_input) {
          return new WritableStream();
        },
        async openDownloadStream(_input) {
          return new ReadableStream();
        },
      };

      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ADAPTER_CONFORMANCE_FAILED');
      expect(result.error?.message).toContain('signedUploadUrls capability requires signUploadUrl');
    });

    it('should fail when statObject method is missing', async () => {
      const adapter = {
        name: 'broken',
        capabilities: {
          signedUploadUrls: false,
          signedDownloadUrls: false,
          multipart: false,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
        async deleteObject(_input: { key: string }) {},
        async openUploadStream(_input: { key: string }) {
          return new WritableStream();
        },
        async openDownloadStream(_input: { key: string }) {
          return new ReadableStream();
        },
      } as unknown as StorageAdapter;

      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('statObject method is required');
    });
  });

  describe('validateCapabilities', () => {
    it('should pass for valid capabilities', () => {
      const caps: StorageAdapterCapabilities = {
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: false,
        proxyStreamingDownload: false,
      };

      const result = validateCapabilities(caps);
      expect(result.ok).toBe(true);
    });

    it('should fail when no upload mode is available', () => {
      const caps: StorageAdapterCapabilities = {
        signedUploadUrls: false,
        signedDownloadUrls: true,
        multipart: false,
        proxyStreamingUpload: false,
        proxyStreamingDownload: true,
      };

      const result = validateCapabilities(caps);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('at least one upload mode');
    });

    it('should fail when no download mode is available', () => {
      const caps: StorageAdapterCapabilities = {
        signedUploadUrls: true,
        signedDownloadUrls: false,
        multipart: false,
        proxyStreamingUpload: false,
        proxyStreamingDownload: false,
      };

      const result = validateCapabilities(caps);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('at least one download mode');
    });
  });

  describe('createFakeStorageAdapter', () => {
    it('should create adapter with correct capabilities (TV-STORAGE-ADAPTERS-001)', async () => {
      const s3Like = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: true,
          proxyStreamingUpload: false,
          proxyStreamingDownload: true,
        },
      });

      expect(s3Like.capabilities.multipart).toBe(true);
      expect(s3Like.createMultipartUpload).toBeDefined();

      const localLike = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: false,
          signedDownloadUrls: false,
          multipart: false,
          proxyStreamingUpload: true,
          proxyStreamingDownload: true,
        },
      });

      expect(localLike.capabilities.multipart).toBe(false);
      expect(localLike.createMultipartUpload).toBeUndefined();
    });

    it('should be stateless and safe for concurrent calls (TV-STORAGE-STATELESS-001)', async () => {
      const adapter = createFakeStorageAdapter({
        capabilities: {
          signedUploadUrls: true,
          signedDownloadUrls: true,
          multipart: false,
          proxyStreamingUpload: false,
          proxyStreamingDownload: true,
        },
      });

      const results = await Promise.all([
        adapter.statObject({ key: 'k1' }),
        adapter.statObject({ key: 'k2' }),
      ]);

      expect(results[0].key).toBe('k1');
      expect(results[1].key).toBe('k2');
    });
  });
});
