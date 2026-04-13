import { describe, it, expect } from 'vitest';
import { createGCSStorageAdapter } from './adapter.js';
import { runConformanceTests } from '@superfunctions/storage';

describe('storage-gcs adapter', () => {
  describe('conformance', () => {
    it('should pass conformance tests (method existence)', async () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'test-bucket',
      });
      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
    });

    it('should have correct capabilities', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'test-bucket',
      });
      expect(adapter.capabilities).toEqual({
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: false,
        proxyStreamingUpload: true,
        proxyStreamingDownload: true,
      });
    });
  });

  describe('adapter creation', () => {
    it('should create adapter with minimal config', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'my-bucket',
      });
      expect(adapter.name).toBe('gcs');
    });

    it('should create adapter with projectId', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'my-bucket',
        projectId: 'my-project-123',
      });
      expect(adapter.name).toBe('gcs');
    });

    it('should create adapter with keyFilename', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'my-bucket',
        keyFilename: '/path/to/keyfile.json',
      });
      expect(adapter.name).toBe('gcs');
    });

    it('should create adapter with credentials', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'my-bucket',
        credentials: {
          client_email: 'test@example.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...KEY...==\n-----END PRIVATE KEY-----\n',
        },
      });
      expect(adapter.name).toBe('gcs');
    });
  });

  describe('multipart methods', () => {
    it('should NOT have multipart methods (GCS does not support S3-style multipart)', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'test-bucket',
      });

      expect(adapter.createMultipartUpload).toBeUndefined();
      expect(adapter.signMultipartUploadPartUrl).toBeUndefined();
      expect(adapter.completeMultipartUpload).toBeUndefined();
      expect(adapter.abortMultipartUpload).toBeUndefined();
    });
  });

  describe('signed URL methods', () => {
    it('should have signed URL methods', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'test-bucket',
      });

      expect(adapter.signUploadUrl).toBeDefined();
      expect(adapter.signDownloadUrl).toBeDefined();
    });
  });

  describe('proxy streaming methods', () => {
    it('should have proxy streaming methods', () => {
      const adapter = createGCSStorageAdapter({
        bucket: 'test-bucket',
      });

      expect(adapter.openUploadStream).toBeDefined();
      expect(adapter.openDownloadStream).toBeDefined();
    });
  });
});
