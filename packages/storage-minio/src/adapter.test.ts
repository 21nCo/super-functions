import { describe, it, expect } from 'vitest';
import { createMinIOStorageAdapter } from './adapter.js';
import { runConformanceTests, validateCapabilities } from '@superfunctions/storage';

describe('@superfunctions/storage-minio', () => {
  const adapter = createMinIOStorageAdapter({
    endpoint: 'localhost',
    bucket: 'test-bucket',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    port: 9000,
    useSSL: false,
  });

  describe('Adapter instantiation (STORAGE-001)', () => {
    it('should create adapter with correct name', () => {
      expect(adapter.name).toBe('minio');
    });

    it('should be stateless - factory returns immutable instance', () => {
      const adapter1 = createMinIOStorageAdapter({
        endpoint: 'host1',
        bucket: 'bucket1',
        accessKeyId: 'key1',
        secretAccessKey: 'secret1',
      });
      const adapter2 = createMinIOStorageAdapter({
        endpoint: 'host2',
        bucket: 'bucket2',
        accessKeyId: 'key2',
        secretAccessKey: 'secret2',
      });

      expect(adapter1.name).toBe('minio');
      expect(adapter2.name).toBe('minio');
      expect(adapter1).not.toBe(adapter2);
    });

    it('should support custom region', () => {
      const customAdapter = createMinIOStorageAdapter({
        endpoint: 'localhost',
        bucket: 'test',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        region: 'custom-region',
      });
      expect(customAdapter.name).toBe('minio');
    });

    it('should support full endpoint URL', () => {
      const customAdapter = createMinIOStorageAdapter({
        endpoint: 'https://minio.example.com:9000',
        bucket: 'test',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      });
      expect(customAdapter.name).toBe('minio');
    });
  });

  describe('Capabilities (STORAGE-002)', () => {
    it('should declare accurate capabilities for MinIO', () => {
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

  describe('MinIO-specific features', () => {
    it('should use path-style addressing (forcePathStyle)', () => {
      expect(adapter.name).toBe('minio');
    });

    it('applies explicit port even when endpoint already includes a protocol', () => {
      const customAdapter = createMinIOStorageAdapter({
        endpoint: 'http://localhost',
        bucket: 'test',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        port: 9000,
        useSSL: false,
      });

      expect(customAdapter.name).toBe('minio');
    });

    it('should support both SSL and non-SSL endpoints', () => {
      const sslAdapter = createMinIOStorageAdapter({
        endpoint: 'minio.example.com',
        bucket: 'test',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        useSSL: true,
      });

      const nonSslAdapter = createMinIOStorageAdapter({
        endpoint: 'localhost',
        bucket: 'test',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        useSSL: false,
        port: 9000,
      });

      expect(sslAdapter.name).toBe('minio');
      expect(nonSslAdapter.name).toBe('minio');
    });
  });
});
