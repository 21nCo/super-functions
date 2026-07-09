import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  SignedUrlConstraints,
  StorageAdapter,
  StorageAdapterCapabilities,
  StorageObjectStat,
} from '../types.js';
import {
  assertMultipartParts,
  assertValidSignedUrlExpiry,
  createNotFoundError,
  isNotFoundError,
} from './errors.js';

interface S3LikeClient {
  send(command: unknown): Promise<any>;
}

export interface S3CompatibleAdapterConfig {
  name: string;
  bucket: string;
  client: S3LikeClient;
  capabilities?: StorageAdapterCapabilities;
  statNotFoundErrorNames?: string[];
  downloadNotFoundErrorNames?: string[];
}

const DEFAULT_CAPABILITIES: StorageAdapterCapabilities = {
  signedUploadUrls: true,
  signedDownloadUrls: true,
  multipart: true,
  proxyStreamingUpload: false,
  proxyStreamingDownload: true,
};

export function createS3CompatibleStorageAdapter(config: S3CompatibleAdapterConfig): StorageAdapter {
  const {
    name,
    bucket,
    client,
    capabilities = { ...DEFAULT_CAPABILITIES },
    statNotFoundErrorNames = ['NotFound'],
    downloadNotFoundErrorNames = ['NoSuchKey'],
  } = config;

  return {
    name,
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
        if (isNotFoundError(err, { names: statNotFoundErrorNames, statusCode: 404 })) {
          throw createNotFoundError();
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
      assertValidSignedUrlExpiry(input.expiresInSeconds);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.constraints?.contentType,
        ContentLength: input.constraints?.contentLength,
      });

      const url = await getSignedUrl(client as any, command, {
        expiresIn: input.expiresInSeconds,
      });

      const headers: Record<string, string> = {};
      if (input.constraints?.contentType) {
        headers['Content-Type'] = input.constraints.contentType;
      }

      return {
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      };
    },

    async signDownloadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: { responseContentType?: string };
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      assertValidSignedUrlExpiry(input.expiresInSeconds);
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ResponseContentType: input.constraints?.responseContentType,
      });

      const url = await getSignedUrl(client as any, command, {
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
      assertValidSignedUrlExpiry(input.expiresInSeconds);
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.constraints?.contentLength,
      });

      const url = await getSignedUrl(client as any, command, {
        expiresIn: input.expiresInSeconds,
      });

      return { url };
    },

    async completeMultipartUpload(input: {
      key: string;
      uploadId: string;
      parts: Array<{ partNumber: number; etag: string }>;
    }): Promise<void> {
      assertMultipartParts(input.parts);

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: [...input.parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((part) => ({
                PartNumber: part.partNumber,
                ETag: part.etag,
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
        if (isNotFoundError(err, { names: downloadNotFoundErrorNames, statusCode: 404 })) {
          throw createNotFoundError();
        }
        throw err;
      }
    },
  };
}
