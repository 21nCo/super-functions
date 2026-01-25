export interface FileProviderContext {
  principalId?: string;
  tenantId?: string;
  requestId?: string;
}

export interface FileProvider {
  createUploadSession(input: {
    policy: string;
    fileName: string;
    size: number;
    mimeType: string;
    fileId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }, ctx: FileProviderContext): Promise<{ uploadSessionId: string }>;

  getUploadSessionStatus(input: { uploadSessionId: string }, ctx: FileProviderContext): Promise<unknown>;

  signUploadPart(input: {
    uploadSessionId: string;
    partNumber: number;
    contentLength: number;
    checksumSha256Base64?: string;
  }, ctx: FileProviderContext): Promise<{ url: string; headers?: Record<string, string> }>;

  completeUploadPart(input: {
    uploadSessionId: string;
    partNumber: number;
    etag: string;
    size: number;
    checksumSha256Base64?: string;
  }, ctx: FileProviderContext): Promise<void>;

  completeUploadSession(input: {
    uploadSessionId: string;
  }, ctx: FileProviderContext): Promise<{ fileId: string; versionId: string }>;

  abortUploadSession(input: { uploadSessionId: string }, ctx: FileProviderContext): Promise<void>;

  getFile(input: { fileId: string; versionId?: string }, ctx: FileProviderContext): Promise<unknown>;
  listFiles(input: { cursor?: string; limit?: number }, ctx: FileProviderContext): Promise<unknown>;
  deleteFile(input: { fileId: string }, ctx: FileProviderContext): Promise<void>;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface FileUpload {
  file: File | Blob | Uint8Array;
  name: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}
