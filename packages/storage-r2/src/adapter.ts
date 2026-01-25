import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageAdapter,
  StorageAdapterCapabilities,
  StorageObjectStat,
  SignedUrlConstraints,
} from '@superfunctions/storage';

export interface R2StorageConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction?: 'eu' | 'fedramp';
}

export function createR2StorageAdapter(config: R2StorageConfig): StorageAdapter {
  const { accountId, bucket, accessKeyId, secretAccessKey, jurisdiction } = config;

  const endpoint = jurisdiction
    ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const capabilities: StorageAdapterCapabilities = {
    signedUploadUrls: true,
    signedDownloadUrls: true,
    multipart: true,
    proxyStreamingUpload: false,
    proxyStreamingDownload: true,
  };

  return {
    name: 'r2',
    capabilities,

    async statObject(input: { key: string }): Promise<StorageObjectStat> {
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: input.key,
          })
        );

        return {
          key: input.key,
          size: response.ContentLength ?? 0,
          contentType: response.ContentType,
          etag: response.ETag,
          lastModifiedAt: response.LastModified?.toISOString(),
        };
      } catch (err: unknown) {
        const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
          const notFoundError = new Error('Object not found') as Error & { code: string };
          notFoundError.code = 'STORAGE_NOT_FOUND';
          throw notFoundError;
        }
        throw err;
      }
    },

    async deleteObject(input: { key: string }): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: input.key,
        })
      );
    },

    async signUploadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: SignedUrlConstraints;
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.constraints?.contentType,
        ContentLength: input.constraints?.contentLength,
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: input.expiresInSeconds,
      });

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
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ResponseContentType: input.constraints?.responseContentType,
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: input.expiresInSeconds,
      });

      return { url };
    },

    async createMultipartUpload(input: {
      key: string;
      contentType?: string;
      metadata?: Record<string, string>;
    }): Promise<{ uploadId: string }> {
      const response = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          ContentType: input.contentType,
          Metadata: input.metadata,
        })
      );

      if (!response.UploadId) {
        throw new Error('Failed to create multipart upload: no UploadId returned');
      }

      return { uploadId: response.UploadId };
    },

    async signMultipartUploadPartUrl(input: {
      key: string;
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
      constraints?: SignedUrlConstraints;
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.constraints?.contentLength,
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: input.expiresInSeconds,
      });

      return { url };
    },

    async completeMultipartUpload(input: {
      key: string;
      uploadId: string;
      parts: Array<{ partNumber: number; etag: string }>;
    }): Promise<void> {
      if (input.parts.length === 0) {
        const error = new Error('No parts provided') as Error & { code: string };
        error.code = 'STORAGE_MULTIPART_INVALID';
        throw error;
      }

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: input.parts
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
              })),
          },
        })
      );
    },

    async abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
        })
      );
    },

    async openDownloadStream(input: {
      key: string;
      range?: { start: number; endInclusive: number };
    }): Promise<ReadableStream> {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Range: input.range ? `bytes=${input.range.start}-${input.range.endInclusive}` : undefined,
      });

      try {
        const response = await client.send(command);

        if (!response.Body) {
          throw new Error('No body in response');
        }

        return response.Body.transformToWebStream();
      } catch (err: unknown) {
        const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          const notFoundError = new Error('Object not found') as Error & { code: string };
          notFoundError.code = 'STORAGE_NOT_FOUND';
          throw notFoundError;
        }
        throw err;
      }
    },
  };
}
