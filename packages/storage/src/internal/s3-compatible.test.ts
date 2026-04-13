import { describe, expect, it } from 'vitest';
import { createS3CompatibleStorageAdapter } from './s3-compatible.js';

describe('s3-compatible shared core', () => {
  it('maps configured not-found errors to STORAGE_NOT_FOUND', async () => {
    const adapter = createS3CompatibleStorageAdapter({
      name: 'test',
      bucket: 'bucket',
      client: {
        async send() {
          const error = new Error('not found') as Error & { name: string };
          error.name = 'NotFound';
          throw error;
        },
      },
      statNotFoundErrorNames: ['NotFound'],
      downloadNotFoundErrorNames: ['NoSuchKey'],
    });

    await expect(adapter.statObject({ key: 'missing' })).rejects.toMatchObject({
      code: 'STORAGE_NOT_FOUND',
    });
  });

  it('validates multipart completion input', async () => {
    const adapter = createS3CompatibleStorageAdapter({
      name: 'test',
      bucket: 'bucket',
      client: {
        async send() {
          return {};
        },
      },
    });

    await expect(
      adapter.completeMultipartUpload({
        key: 'k',
        uploadId: 'u',
        parts: [],
      })
    ).rejects.toMatchObject({
      code: 'STORAGE_MULTIPART_INVALID',
    });
  });
});
