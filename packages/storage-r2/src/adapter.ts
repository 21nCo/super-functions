import { S3Client } from '@aws-sdk/client-s3';
import { createS3CompatibleStorageAdapter } from '@superfunctions/storage/internal/s3-compatible';
import type { StorageAdapter } from '@superfunctions/storage';

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

  return createS3CompatibleStorageAdapter({
    name: 'r2',
    bucket,
    client,
    statNotFoundErrorNames: ['NotFound'],
    downloadNotFoundErrorNames: ['NoSuchKey'],
  });
}
