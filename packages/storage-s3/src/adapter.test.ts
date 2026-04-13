import { describe, it, expect } from 'vitest';
import { createS3StorageAdapter } from './adapter.js';
import { runConformanceTests } from '@superfunctions/storage';

describe('storage-s3 adapter', () => {
  describe('conformance', () => {
    it('should pass conformance tests (method existence)', async () => {
      const adapter = createS3StorageAdapter({
        bucket: 'test-bucket',
        region: 'us-east-1',
      });
      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
    });

    it('should have correct capabilities', () => {
      const adapter = createS3StorageAdapter({
        bucket: 'test-bucket',
        region: 'us-east-1',
      });
      expect(adapter.capabilities).toEqual({
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: false,
        proxyStreamingDownload: true,
      });
    });
  });

  describe('adapter creation', () => {
    it('should create adapter with minimal config', () => {
      const adapter = createS3StorageAdapter({
        bucket: 'my-bucket',
        region: 'eu-west-1',
      });
      expect(adapter.name).toBe('s3');
    });

    it('should create adapter with full config', () => {
      const adapter = createS3StorageAdapter({
        bucket: 'my-bucket',
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      });
      expect(adapter.name).toBe('s3');
    });

    it('requires both static credential fields when either is provided', () => {
      expect(() =>
        createS3StorageAdapter({
          bucket: 'my-bucket',
          region: 'us-east-1',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        })
      ).toThrow('S3 storage config requires both accessKeyId and secretAccessKey when using static credentials');
    });

    it('rejects empty static credentials instead of silently falling back', () => {
      expect(() =>
        createS3StorageAdapter({
          bucket: 'my-bucket',
          region: 'us-east-1',
          accessKeyId: '',
          secretAccessKey: '',
        })
      ).toThrow('S3 storage config requires non-empty accessKeyId and secretAccessKey when using static credentials');
    });
  });

  describe('multipart methods', () => {
    it('should have all multipart methods', () => {
      const adapter = createS3StorageAdapter({
        bucket: 'test-bucket',
        region: 'us-east-1',
      });

      expect(adapter.createMultipartUpload).toBeDefined();
      expect(adapter.signMultipartUploadPartUrl).toBeDefined();
      expect(adapter.completeMultipartUpload).toBeDefined();
      expect(adapter.abortMultipartUpload).toBeDefined();
    });
  });

  describe('signed URL methods', () => {
    it('should have signed URL methods', () => {
      const adapter = createS3StorageAdapter({
        bucket: 'test-bucket',
        region: 'us-east-1',
      });

      expect(adapter.signUploadUrl).toBeDefined();
      expect(adapter.signDownloadUrl).toBeDefined();
    });
  });

  describe('completeMultipartUpload validation', () => {
    it('should reject empty parts array', async () => {
      const adapter = createS3StorageAdapter({
        bucket: 'test-bucket',
        region: 'us-east-1',
      });

      await expect(
        adapter.completeMultipartUpload!({
          key: 'test-key',
          uploadId: 'test-upload-id',
          parts: [],
        })
      ).rejects.toMatchObject({ code: 'STORAGE_MULTIPART_INVALID' });
    });
  });
});
