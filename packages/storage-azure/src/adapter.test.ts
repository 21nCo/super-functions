import { describe, it, expect } from 'vitest';
import { createAzureStorageAdapter } from './adapter.js';
import { runConformanceTests } from '@superfunctions/storage';

describe('storage-azure adapter', () => {
  describe('conformance', () => {
    it('should pass conformance tests (method existence)', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });
      const result = await runConformanceTests(adapter);
      expect(result.ok).toBe(true);
    });

    it('should have correct capabilities', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });
      expect(adapter.capabilities).toEqual({
        signedUploadUrls: true,
        signedDownloadUrls: true,
        multipart: true,
        proxyStreamingUpload: true,
        proxyStreamingDownload: true,
      });
    });
  });

  describe('adapter creation', () => {
    it('should create adapter with connection string', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'my-container',
        connectionString: 'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net',
      });
      expect(adapter.name).toBe('azure');
    });

    it('should create adapter with account name and key', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'my-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });
      expect(adapter.name).toBe('azure');
    });

    it('should create adapter with account name and SAS token', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'my-container',
        accountName: 'testaccount',
        sasToken: 'sv=2020-08-04&ss=b&srt=sco&sp=rwdlac&se=2025-01-01T00:00:00Z&st=2024-01-01T00:00:00Z&spr=https&sig=signature',
      });
      expect(adapter.name).toBe('azure');
    });

    it('should create adapter with custom endpoint', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'my-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
        endpoint: 'https://custom-endpoint.blob.core.windows.net',
      });
      expect(adapter.name).toBe('azure');
    });

    it('should throw error with incomplete config', () => {
      expect(() => {
        createAzureStorageAdapter({
          containerName: 'my-container',
        } as any);
      }).toThrow('Azure storage config requires either connectionString or (accountName + accountKey) or (accountName + sasToken)');
    });
  });

  describe('multipart methods', () => {
    it('should have multipart methods (Azure block blob semantics)', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      expect(adapter.createMultipartUpload).toBeDefined();
      expect(adapter.signMultipartUploadPartUrl).toBeDefined();
      expect(adapter.completeMultipartUpload).toBeDefined();
      expect(adapter.abortMultipartUpload).toBeDefined();
    });

    it('should generate stateless uploadId (base64 of key)', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const key = 'test-file.bin';
      const result = await adapter.createMultipartUpload!({
        key,
        contentType: 'application/octet-stream',
      });

      const decoded = JSON.parse(Buffer.from(result.uploadId, 'base64').toString('utf8')) as {
        key: string;
        sessionId: string;
      };

      expect(decoded.key).toBe(key);
      expect(decoded.sessionId).toEqual(expect.any(String));
    });

    it('should generate unique uploadIds per multipart session for the same key', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const first = await adapter.createMultipartUpload!({ key: 'test-file.bin' });
      const second = await adapter.createMultipartUpload!({ key: 'test-file.bin' });

      expect(first.uploadId).not.toBe(second.uploadId);
    });

    it('still accepts legacy base64(key) uploadIds even when the key is valid JSON', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const key = 'null';
      const legacyUploadId = Buffer.from(key).toString('base64');

      const part = await adapter.signMultipartUploadPartUrl!({
        key,
        uploadId: legacyUploadId,
        partNumber: 1,
        expiresInSeconds: 900,
      });

      expect(part.url).toContain('blockid=');
    });
  });

  describe('signed URL methods', () => {
    it('should have signed URL methods', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      expect(adapter.signUploadUrl).toBeDefined();
      expect(adapter.signDownloadUrl).toBeDefined();
    });

    it('should throw error when generating SAS without credentials', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        sasToken: 'existing-token',
      });

      await expect(async () => {
        await adapter.signUploadUrl!({
          key: 'test.txt',
          expiresInSeconds: 900,
        });
      }).rejects.toThrow('SAS URL generation requires accountName and credential (accountKey)');
    });

    it('returns the required blob type header for signed uploads', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const result = await adapter.signUploadUrl!({
        key: 'test.txt',
        expiresInSeconds: 900,
      });

      expect(result.headers).toMatchObject({
        'x-ms-blob-type': 'BlockBlob',
      });
    });

    it('disables signed-url capabilities when only a SAS token is configured', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        sasToken: '?existing-token',
      });

      expect(adapter.capabilities).toMatchObject({
        signedUploadUrls: false,
        signedDownloadUrls: false,
        multipart: false,
      });
    });
  });

  describe('proxy streaming methods', () => {
    it('should have proxy streaming methods', () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      expect(adapter.openUploadStream).toBeDefined();
      expect(adapter.openDownloadStream).toBeDefined();
    });
  });

  describe('block blob semantics', () => {
    it('should map part numbers to block IDs', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const key = 'test-multipart.bin';
      const { uploadId } = await adapter.createMultipartUpload!({
        key,
      });

      // Sign part 1
      const part1 = await adapter.signMultipartUploadPartUrl!({
        key,
        uploadId,
        partNumber: 1,
        expiresInSeconds: 900,
      });

      // URL should contain blockid parameter
      expect(part1.url).toContain('comp=block');
      expect(part1.url).toContain('blockid=');
    });

    it('TV-STORAGE-AZURE-STATELESS-001: should allow cross-instance multipart operations', async () => {
      const config = {
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      };
      const adapterA = createAzureStorageAdapter(config);
      const adapterB = createAzureStorageAdapter(config);

      const key = 'stateless-test.bin';

      // Create with A
      const { uploadId } = await adapterA.createMultipartUpload!({
        key,
        contentType: 'application/octet-stream',
      });

      // Sign with B
      const part = await adapterB.signMultipartUploadPartUrl!({
        key,
        uploadId,
        partNumber: 1,
        expiresInSeconds: 900,
      });

      expect(part.url).toBeDefined();
      expect(part.url).toContain('blockid=');
    });

    it('should reject invalid uploadId', async () => {
      const adapter = createAzureStorageAdapter({
        containerName: 'test-container',
        accountName: 'testaccount',
        accountKey: 'dGVzdGtleQ==',
      });

      const key = 'test-file.bin';
      const badUploadId = Buffer.from('wrong-key').toString('base64');

      await expect(
        adapter.signMultipartUploadPartUrl!({
          key,
          uploadId: badUploadId,
          partNumber: 1,
          expiresInSeconds: 900,
        })
      ).rejects.toThrow(`Invalid uploadId for key: ${key}`);
    });
  });
});
