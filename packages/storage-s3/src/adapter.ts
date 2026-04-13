import { S3Client } from '@aws-sdk/client-s3';
import { createS3CompatibleStorageAdapter } from '@superfunctions/storage/internal/s3-compatible';
import type { StorageAdapter } from '@superfunctions/storage';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export function createS3StorageAdapter(config: S3StorageConfig): StorageAdapter {
  const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = config;
  const hasAccessKeyId = accessKeyId !== undefined;
  const hasSecretAccessKey = secretAccessKey !== undefined;
  if (hasAccessKeyId !== hasSecretAccessKey) {
    throw new Error('S3 storage config requires both accessKeyId and secretAccessKey when using static credentials');
  }
  if (hasAccessKeyId && (accessKeyId === '' || secretAccessKey === '')) {
    throw new Error('S3 storage config requires non-empty accessKeyId and secretAccessKey when using static credentials');
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials:
      hasAccessKeyId
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });

  return createS3CompatibleStorageAdapter({
    name: 's3',
    bucket,
    client,
    statNotFoundErrorNames: ['NotFound'],
    downloadNotFoundErrorNames: ['NoSuchKey'],
  });
}
