import { S3Client } from '@aws-sdk/client-s3';
import { createS3CompatibleStorageAdapter } from '@superfunctions/storage/internal/s3-compatible';
import type { StorageAdapter } from '@superfunctions/storage';

export interface MinIOStorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  useSSL?: boolean;
  port?: number;
}

export function createMinIOStorageAdapter(config: MinIOStorageConfig): StorageAdapter {
  const {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region = 'us-east-1',
    useSSL = true,
    port,
  } = config;

  const protocol = useSSL ? 'https' : 'http';
  const endpointWithScheme = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${protocol}://${endpoint}`;
  const endpointUrl = new URL(endpointWithScheme);
  if (port !== undefined) {
    endpointUrl.port = String(port);
  }
  const fullEndpoint = endpointUrl.toString().replace(/\/$/, '');

  const client = new S3Client({
    region,
    endpoint: fullEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return createS3CompatibleStorageAdapter({
    name: 'minio',
    bucket,
    client,
    statNotFoundErrorNames: ['NotFound', 'NoSuchKey'],
    downloadNotFoundErrorNames: ['NoSuchKey'],
  });
}
