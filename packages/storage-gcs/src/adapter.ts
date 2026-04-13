import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import type { StorageAdapter, StorageAdapterCapabilities, StorageObjectStat, SignedUrlConstraints } from '@superfunctions/storage';
import { createNotFoundError, isNotFoundError } from '@superfunctions/storage/internal/errors';

export interface GCSStorageConfig {
  bucket: string;
  projectId?: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

export function createGCSStorageAdapter(config: GCSStorageConfig): StorageAdapter {
  const { bucket: bucketName, projectId, keyFilename, credentials } = config;

  const storage = new Storage({
    projectId,
    keyFilename,
    credentials,
  });

  const bucket = storage.bucket(bucketName);

  const capabilities: StorageAdapterCapabilities = {
    signedUploadUrls: true,
    signedDownloadUrls: true,
    multipart: false,
    proxyStreamingUpload: true,
    proxyStreamingDownload: true,
  };

  return {
    name: 'gcs',
    capabilities,

    async statObject(input: { key: string }): Promise<StorageObjectStat> {
      try {
        const file = bucket.file(input.key);
        const [metadata] = await file.getMetadata();

        return {
          key: input.key,
          size: typeof metadata.size === 'number' ? metadata.size : parseInt(metadata.size || '0', 10),
          contentType: metadata.contentType,
          etag: metadata.etag,
          lastModifiedAt: metadata.updated || metadata.timeCreated,
        };
      } catch (err: unknown) {
        if (isNotFoundError(err, { numericCodes: [404] })) {
          throw createNotFoundError();
        }
        throw err;
      }
    },

    async deleteObject(input: { key: string }): Promise<void> {
      try {
        const file = bucket.file(input.key);
        await file.delete({ ignoreNotFound: true });
      } catch (err: unknown) {
        throw err;
      }
    },

    async signUploadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: SignedUrlConstraints;
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      const file = bucket.file(input.key);

      const signConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + input.expiresInSeconds * 1000,
      };

      if (input.constraints?.contentType) {
        signConfig.contentType = input.constraints.contentType;
      }

      const [url] = await file.getSignedUrl(signConfig);

      const headers: Record<string, string> = {};
      if (input.constraints?.contentType) {
        headers['Content-Type'] = input.constraints.contentType;
      }

      return { url, headers: Object.keys(headers).length > 0 ? headers : undefined };
    },

    async signDownloadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: { responseContentType?: string };
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      const file = bucket.file(input.key);

      const signConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + input.expiresInSeconds * 1000,
      };

      if (input.constraints?.responseContentType) {
        signConfig.responseType = input.constraints.responseContentType;
      }

      const [url] = await file.getSignedUrl(signConfig);

      return { url };
    },

    async openUploadStream(input: { key: string; contentType?: string }): Promise<WritableStream> {
      const file = bucket.file(input.key);

      const gcstream = file.createWriteStream({
        resumable: false,
        metadata: {
          contentType: input.contentType,
        },
      });
      let streamError: Error | null = null;
      gcstream.on('error', (err) => {
        streamError = err;
      });

      return new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            if (streamError) {
              reject(streamError);
              return;
            }
            const buffer = chunk instanceof Uint8Array ? Buffer.from(chunk) : chunk;
            const ok = gcstream.write(buffer);
            if (ok) {
              resolve();
            } else {
              const cleanup = () => {
                gcstream.off('drain', onDrain);
                gcstream.off('error', onError);
              };
              const onDrain = () => {
                cleanup();
                resolve();
              };
              const onError = (err: Error) => {
                cleanup();
                reject(err);
              };
              gcstream.once('drain', onDrain);
              gcstream.once('error', onError);
            }
          });
        },
        close() {
          return new Promise((resolve, reject) => {
            if (streamError) {
              reject(streamError);
              return;
            }
            const cleanup = () => {
              gcstream.off('finish', onFinish);
              gcstream.off('error', onError);
            };
            const onFinish = () => {
              cleanup();
              resolve(undefined);
            };
            const onError = (err: Error) => {
              cleanup();
              reject(err);
            };
            gcstream.once('finish', onFinish);
            gcstream.once('error', onError);
            gcstream.end();
          });
        },
        abort(reason) {
          gcstream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
        },
      });
    },

    async openDownloadStream(input: { key: string; range?: { start: number; endInclusive: number } }): Promise<ReadableStream> {
      const file = bucket.file(input.key);

      try {
        const [exists] = await file.exists();
        if (!exists) {
          throw createNotFoundError();
        }
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'STORAGE_NOT_FOUND') {
          throw err;
        }
        throw err;
      }

      const options = input.range
        ? { start: input.range.start, end: input.range.endInclusive }
        : undefined;

      const gcstream = file.createReadStream(options);

      return new ReadableStream({
        start(controller) {
          gcstream.on('data', (chunk: Buffer | string) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buffer));
          });
          gcstream.on('end', () => {
            controller.close();
          });
          gcstream.on('error', (err) => {
            if (isNotFoundError(err, { numericCodes: [404] })) {
              controller.error(createNotFoundError());
            } else {
              controller.error(err);
            }
          });
        },
        cancel() {
          gcstream.destroy();
        },
      });
    },
  };
}
