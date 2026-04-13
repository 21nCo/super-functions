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

export type StorageTargetName = string;

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
  capabilitiesForTarget?(target: StorageTargetName): StorageAdapterCapabilities;

  statObject(input: { key: string; target?: StorageTargetName }): Promise<StorageObjectStat>;
  deleteObject(input: { key: string; target?: StorageTargetName }): Promise<void>;

  signUploadUrl?(input: {
    key: string;
    target?: StorageTargetName;
    expiresInSeconds: number;
    constraints?: SignedUrlConstraints;
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  signDownloadUrl?(input: {
    key: string;
    target?: StorageTargetName;
    expiresInSeconds: number;
    constraints?: { responseContentType?: string };
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  createMultipartUpload?(input: {
    key: string;
    target?: StorageTargetName;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ uploadId: string }>;

  signMultipartUploadPartUrl?(input: {
    key: string;
    target?: StorageTargetName;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
    constraints?: SignedUrlConstraints;
  }): Promise<{ url: string; headers?: Record<string, string> }>;

  completeMultipartUpload?(input: {
    key: string;
    target?: StorageTargetName;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<void>;

  abortMultipartUpload?(input: { key: string; target?: StorageTargetName; uploadId: string }): Promise<void>;

  openUploadStream?(input: {
    key: string;
    target?: StorageTargetName;
    contentType?: string;
  }): Promise<WritableStream>;
  openDownloadStream?(input: {
    key: string;
    target?: StorageTargetName;
    range?: { start: number; endInclusive: number };
  }): Promise<ReadableStream>;
}
