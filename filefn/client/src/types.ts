import type {
  HeicPreprocessorOptions,
  PendingLocalSourceMetadata,
  UploadPreprocessor,
} from './preprocessing/types.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface FileFnClientConfig {
  baseUrl: string;
  getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  retryOptions?: RetryOptions;
  offline?: {
    enabled: boolean;
    opfsDir?: string;
  };
  preprocessing?: {
    preprocessors?: UploadPreprocessor[];
    heic?: HeicPreprocessorOptions & {
      enabled?: boolean;
    };
  };
}

export interface UploadInput {
  policy: string;
  file: File | Blob;
  fileName?: string;
  metadata?: Record<string, unknown>;
  fileId?: string;
  idempotencyKey?: string;
  preprocessors?: UploadPreprocessor[];
}

export interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  partsCompleted: number;
  totalParts: number;
}

export interface UploadResult {
  fileId: string;
  versionId: string;
}

export type RenderIntent = 'thumbnail' | 'preview' | 'full' | 'download';
export type RenderState = 'ready' | 'processing' | 'pending-local' | 'unsupported';
export type RenderPlaceholderKind = 'generic-file' | 'pdf-processing' | 'unsupported-preview';

export interface ArtifactDescriptor {
  artifactId: string;
  fileId: string;
  versionId: string;
  kind: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface RenderDescriptor {
  fileId: string;
  versionId: string;
  intent: RenderIntent;
  state: RenderState;
  mimeType: string;
  name: string;
  size: number;
  source:
    | {
        mode: 'artifact';
        artifactId: string;
        artifactKind: string;
        url: string;
        headers?: Record<string, string>;
      }
    | {
        mode: 'original';
        url: string;
        headers?: Record<string, string>;
      }
    | {
        mode: 'placeholder';
        placeholderKind: RenderPlaceholderKind;
      };
  warnings?: string[];
}

export interface UploadHandle {
  uploadSessionId: string;
  uploadSessionToken?: string;
  fileId?: string;
  onProgress(callback: (progress: UploadProgress) => void): void;
  abort(): void;
  done(): Promise<UploadResult>;
}

export interface UploadHandleWithFileId extends UploadHandle {
  fileId: string;
}

export interface PendingLocalDescriptor {
  fileId: string;
  uploadSessionId: string;
  state: 'pending-local';
  source: PendingLocalSourceMetadata & {
    url: string;
  };
}

export interface InitUploadResponse {
  uploadSessionId: string;
  uploadSessionToken?: string;
  uploadMode: string;
  chunkSizeBytes: number;
  totalParts: number;
  expiresAt: string;
}

export interface UploadStatusResponse {
  uploadSessionId?: string;
  fileId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'aborted';
  recordedParts: number[];
  uploadedParts?: number[];
  totalParts: number;
  chunkSizeBytes: number;
  fileSize: number;
  expiresAt?: string;
}

export interface SignPartResponse {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CompletePartResponse {
  recorded: boolean;
}

export interface CompleteUploadResponse {
  fileId: string;
  versionId: string;
}

export interface AbortUploadResponse {
  aborted: boolean;
}
