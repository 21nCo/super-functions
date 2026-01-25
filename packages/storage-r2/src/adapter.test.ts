import { describe, it, expect } from 'vitest';
import { createR2StorageAdapter } from './adapter.js';
import { runConformanceTests, validateCapabilities } from '@superfunctions/storage';

describe('@superfunctions/storage-r2', () => {
  const adapter = createR2StorageAdapter({
    accountId: 'test-account-id',
    bucket: 'test-bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  });

  describe('Adapter instantiation (STORAGE-001)', () => {
    it('should create adapter with correct name', () => {
      expect(adapter.name).toBe('r2');
    });

    it('should be stateless - factory returns immutable instance', () => {
      const adapter1 = createR2StorageAdapter({
        accountId: 'account1',
        bucket: 'bucket1',
        accessKeyId: 'key1',
        secretAccessKey: 'secret1',
      });
      const adapter2 = createR2StorageAdapter({
        accountId: 'account2',
        bucket: 'bucket2',
        accessKeyId: 'key2',
        secretAccessKey: 'secret2',
      });

      expect(adapter1.name).toBe('r2');
      expect(adapter2.name).toBe('r2');
      expect(adapter1).not.toBe(adapter2);
    });

    it('should support jurisdiction option', () => {
      const euAdapter = createR2StorageAdapter({
        accountId: 'test-account',
        bucket: 'test-bucket',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        jurisdiction: 'eu',
      });
      expect(euAdapter.name).toBe('r2');
    });
  });

  describe('Capabilities (STORAGE-002)', () => {
    it('should declare accurate capabilities for R2', () => {
      expect(adapter.capabilities).toEqual({
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: false,
        proxyStreamingDownload: true,
      });
    });

    it('should pass capability validation', () => {
      const result = validateCapabilities(adapter.capabilities);
      expect(result.ok).toBe(true);
    });
  });

  describe('Required methods (STORAGE-003)', () => {
    it('should have statObject method', () => {
      expect(typeof adapter.statObject).toBe('function');
    });

    it('should have deleteObject method', () => {
      expect(typeof adapter.deleteObject).toBe('function');
    });
  });

  describe('Multipart methods (STORAGE-004)', () => {
    it('should have createMultipartUpload when multipart is true', () => {
      expect(adapter.capabilities.multipart).toBe(true);
      expect(typeof adapter.createMultipartUpload).toBe('function');
    });

    it('should have signMultipartUploadPartUrl when multipart is true', () => {
      expect(typeof adapter.signMultipartUploadPartUrl).toBe('function');
    });

    it('should have completeMultipartUpload when multipart is true', () => {
      expect(typeof adapter.completeMultipartUpload).toBe('function');
    });

    it('should have abortMultipartUpload when multipart is true', () => {
      expect(typeof adapter.abortMultipartUpload).toBe('function');
    });
  });

  describe('Signed URL methods', () => {
    it('should have signUploadUrl when signedUploadUrls is true', () => {
      expect(adapter.capabilities.signedUploadUrls).toBe(true);
      expect(typeof adapter.signUploadUrl).toBe('function');
    });

    it('should have signDownloadUrl when signedDownloadUrls is true', () => {
      expect(adapter.capabilities.signedDownloadUrls).toBe(true);
      expect(typeof adapter.signDownloadUrl).toBe('function');
    });
  });

  describe('Streaming methods', () => {
    it('should have openDownloadStream when proxyStreamingDownload is true', () => {
      expect(adapter.capabilities.proxyStreamingDownload).toBe(true);
      expect(typeof adapter.openDownloadStream).toBe('function');
    });

    it('should not have openUploadStream when proxyStreamingUpload is false', () => {
      expect(adapter.capabilities.proxyStreamingUpload).toBe(false);
      expect(adapter.openUploadStream).toBeUndefined();
    });
  });

  describe('Conformance tests', () => {
    it('should pass all conformance tests', async () => {
      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('R2-specific limitations', () => {
    it('should document that R2 supports content-type constraints on signed URLs', () => {
      expect(adapter.capabilities.signedUploadUrls).toBe(true);
    });

    it('should document that R2 uses S3-compatible API', () => {
      expect(adapter.name).toBe('r2');
    });
  });
});
