import { describe, expect, it } from 'vitest';
import { createS3CompatibleStorageAdapter } from './s3-compatible.js';
import { assertValidSignedUrlExpiry } from './errors.js';

describe('s3-compatible shared core', () => {
  it.each([
    [1, true],
    [1.5, false],
    [604800, true],
    [604801, false],
  ] as const)('validates signed URL expiry boundary %s', (expiresInSeconds, valid) => {
    if (valid) {
      expect(() => assertValidSignedUrlExpiry(expiresInSeconds)).not.toThrow();
    } else {
      expect(() => assertValidSignedUrlExpiry(expiresInSeconds)).toThrow(
        expect.objectContaining({ code: 'STORAGE_SIGNED_URL_EXPIRY_INVALID' })
      );
    }
  });

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
