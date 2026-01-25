export type StorageAdapterName =
  | 's3'
  | 'r2'
  | 'gcs'
  | 'azure'
  | 'minio'
  | 'local'
  | (string & {});

export interface StorageAdapterCapabilities {
  signedUploadUrls: boolean;
  signedDownloadUrls: boolean;
  multipart: boolean;
  proxyStreamingUpload: boolean;
  proxyStreamingDownload: boolean;
}

export interface SignedUrlConstraints {
  contentType?: string;
  contentLength?: number;
  checksumSha256Base64?: string;
}

export interface MultipartPartDescriptor {
  partNumber: number;
  etag: string;
  size: number;
  checksumSha256Base64?: string;
}

export interface StorageObjectStat {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModifiedAt?: string;
}

export interface StorageAdapter {
  name: StorageAdapterName;
  capabilities: StorageAdapterCapabilities;

  statObject(input: { key: string }): Promise<StorageObjectStat>;
  deleteObject(input: { key: string }): Promise<void>;

  signUploadUrl?(input: {
    key: string;
    expiresInSeconds: number;
    constraints?: SignedUrlConstraints;
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  signDownloadUrl?(input: {
    key: string;
    expiresInSeconds: number;
    constraints?: { responseContentType?: string };
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  createMultipartUpload?(input: {
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ uploadId: string }>;

  signMultipartUploadPartUrl?(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
    constraints?: SignedUrlConstraints;
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  completeMultipartUpload?(input: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<void>;

  abortMultipartUpload?(input: { key: string; uploadId: string }): Promise<void>;

  openUploadStream?(input: { key: string; contentType?: string }): Promise<WritableStream>;
  openDownloadStream?(input: { key: string; range?: { start: number; endInclusive: number } }): Promise<ReadableStream>;
}
