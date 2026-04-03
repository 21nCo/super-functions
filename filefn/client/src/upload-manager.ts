import type { HttpClient } from "./client.js";
import type {
  PendingLocalDescriptor,
  UploadInput,
  UploadHandle,
  UploadProgress,
  UploadResult,
  UploadStatusResponse,
} from "./types.js";
import type {
  PendingLocalSourceMetadata,
  UploadPreprocessor,
  UploadPreprocessorContext,
} from "./preprocessing/types.js";

interface UploadSession {
  uploadSessionId: string;
  totalParts: number;
  chunkSizeBytes: number;
  fileSize: number;
}

export interface PreparedUploadInput {
  fileId: string;
  file: File | Blob;
  fileName: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, unknown>;
  policy: string;
  idempotencyKey?: string;
  localSource: PendingLocalSourceMetadata;
}

const FILE_ID_MISMATCH_ERROR = 'FILEFN_CLIENT_FILE_ID_MISMATCH';

function createClientError(code: string, message: string, details?: Record<string, unknown>): Error & {
  code: string;
  details?: Record<string, unknown>;
} {
  const error = new Error(message) as Error & {
    code: string;
    details?: Record<string, unknown>;
  };
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function currentFileName(file: File | Blob, fallback?: string): string {
  if (fallback) {
    return fallback;
  }
  if (typeof File !== 'undefined' && file instanceof File) {
    return file.name;
  }
  return 'blob';
}

function currentMimeType(file: File | Blob): string {
  return file.type || 'application/octet-stream';
}

function derivePendingLocalSource(
  fileName: string,
  mimeType: string,
  size: number,
): PendingLocalSourceMetadata {
  if (mimeType.startsWith('image/')) {
    return {
      mode: 'local-object-url',
      kind: 'image',
      fileName,
      mimeType,
      size,
      opfsDataFile: 'data.bin',
      previewBehavior: 'direct-image',
    };
  }

  if (mimeType === 'application/pdf') {
    return {
      mode: 'local-object-url',
      kind: 'pdf',
      fileName,
      mimeType,
      size,
      opfsDataFile: 'data.bin',
      previewBehavior: 'deterministic-placeholder',
    };
  }

  return {
    mode: 'local-object-url',
    kind: 'binary',
    fileName,
    mimeType,
    size,
    opfsDataFile: 'data.bin',
    previewBehavior: 'download-only',
  };
}

export function generateFileId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `file_${cryptoApi.randomUUID().replace(/-/g, '')}`;
  }

  return `file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function prepareUploadInput(
  input: UploadInput,
  preprocessors: UploadPreprocessor[] = [],
): Promise<PreparedUploadInput> {
  const fileId = input.fileId ?? generateFileId();
  let prepared: PreparedUploadInput = {
    fileId,
    file: input.file,
    fileName: currentFileName(input.file, input.fileName),
    mimeType: currentMimeType(input.file),
    size: input.file.size,
    metadata: input.metadata,
    policy: input.policy,
    idempotencyKey: input.idempotencyKey,
    localSource: derivePendingLocalSource(
      currentFileName(input.file, input.fileName),
      currentMimeType(input.file),
      input.file.size,
    ),
  };

  for (const preprocessor of preprocessors) {
    const context: UploadPreprocessorContext = {
      fileId,
      file: prepared.file,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      metadata: prepared.metadata,
      localSource: prepared.localSource,
    };
    const matches = await preprocessor.matches(context);
    if (!matches) {
      continue;
    }

    const result = await preprocessor.process(context);
    const nextFile = result.file;
    const nextFileName = result.fileName || currentFileName(nextFile, prepared.fileName);
    const derivedMimeType = currentMimeType(nextFile);
    const nextMimeType =
      result.mimeType ||
      (derivedMimeType !== 'application/octet-stream' ? derivedMimeType : prepared.mimeType);
    const nextMetadata = result.metadata ?? prepared.metadata;
    const nextLocalSource = {
      ...derivePendingLocalSource(nextFileName, nextMimeType, nextFile.size),
      ...result.localSource,
      fileName: nextFileName,
      mimeType: nextMimeType,
      size: nextFile.size,
    };

    prepared = {
      ...prepared,
      file: nextFile,
      fileName: nextFileName,
      mimeType: nextMimeType,
      size: nextFile.size,
      metadata: nextMetadata,
      localSource: nextLocalSource,
    };
  }

  return prepared;
}

export class UploadManager {
  private progressCallbacks: Array<(progress: UploadProgress) => void> = [];
  private abortController: AbortController;
  private session: UploadSession | null = null;
  private file: Blob | null = null;
  private completedParts: Set<number> = new Set();
  private bytesUploaded = 0;
  private uploadSessionToken?: string;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly preprocessors: UploadPreprocessor[] = [],
  ) {
    this.abortController = new AbortController();
  }

  bindAbortSignal(signal: AbortSignal | undefined): void {
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      this.abortController.abort();
      return;
    }
    signal.addEventListener('abort', () => {
      this.abortController.abort();
    }, { once: true });
  }

  createHandle(
    input: UploadInput,
    startUpload: (handle: UploadHandle) => Promise<UploadResult>,
    initialState?: Partial<Pick<UploadHandle, 'uploadSessionId' | 'uploadSessionToken' | 'fileId'>>,
  ): UploadHandle {
    let uploadPromise: Promise<UploadResult> | null = null;
    const isResumedUpload = Boolean(initialState?.uploadSessionId);
    const fileId = input.fileId ?? (isResumedUpload ? undefined : generateFileId());
    if (!input.fileId && fileId) {
      input.fileId = fileId;
    }

    const handle: UploadHandle = {
      uploadSessionId: initialState?.uploadSessionId ?? "",
      uploadSessionToken: initialState?.uploadSessionToken,
      fileId: initialState?.fileId ?? fileId,
      onProgress: (callback) => {
        this.progressCallbacks.push(callback);
      },
      abort: () => {
        this.abortController.abort();
      },
      done: async () => {
        if (!uploadPromise) {
          uploadPromise = startUpload(handle);
        }
        const result = await uploadPromise;
        handle.uploadSessionId = this.session?.uploadSessionId || "";
        handle.uploadSessionToken = this.uploadSessionToken;
        handle.fileId = result.fileId;
        return result;
      },
    };

    return handle;
  }

  async startUpload(input: UploadInput, handle?: UploadHandle): Promise<UploadResult> {
    const signal = this.abortController.signal;
    const prepared = await prepareUploadInput(input, [...this.preprocessors, ...(input.preprocessors || [])]);
    this.file = prepared.file;

    const rawInit = await this.httpClient.initUpload(
      {
        policy: prepared.policy,
        fileName: prepared.fileName,
        size: prepared.size,
        mimeType: prepared.mimeType,
        metadata: prepared.metadata,
        fileId: prepared.fileId,
        idempotencyKey: prepared.idempotencyKey,
      },
      signal,
    );

    // Accept both unwrapped { uploadSessionId, ... } and envelope { data: { uploadSessionId, ... } }
    const initResponse = (
      rawInit && typeof rawInit === "object" && "uploadSessionId" in rawInit
        ? rawInit
        : (
            rawInit as {
              data?: {
                uploadSessionId?: string;
                totalParts?: number;
                chunkSizeBytes?: number;
                uploadSessionToken?: string;
              };
            }
          )?.data
    ) as {
      uploadSessionId?: string;
      totalParts?: number;
      chunkSizeBytes?: number;
      uploadSessionToken?: string;
    };

    const uploadSessionId = initResponse?.uploadSessionId;
    if (!uploadSessionId) {
      throw new Error(
        "Failed to create upload session: no session ID returned. Ensure the server returns { ok: true, data: { uploadSessionId, totalParts, chunkSizeBytes, ... } } or { uploadSessionId, ... }.",
      );
    }

    this.session = {
      uploadSessionId,
      totalParts: initResponse.totalParts ?? 1,
      chunkSizeBytes: initResponse.chunkSizeBytes ?? 0,
      fileSize: prepared.size,
    };
    this.uploadSessionToken = initResponse.uploadSessionToken;
    if (handle) {
      handle.uploadSessionId = uploadSessionId;
      handle.uploadSessionToken = this.uploadSessionToken;
      handle.fileId = prepared.fileId;
    }

    await this.uploadAllParts(signal);

    const result = await this.httpClient.completeUpload(
      this.session.uploadSessionId,
      this.uploadSessionToken,
      signal,
    );

    if (result.fileId !== prepared.fileId) {
      throw createClientError(
        FILE_ID_MISMATCH_ERROR,
        'Server completed upload with a different fileId than the client requested',
        {
          expectedFileId: prepared.fileId,
          actualFileId: result.fileId,
        },
      );
    }

    return result;
  }

  async resumeUpload(
    uploadSessionId: string,
    file: Blob,
    uploadSessionToken?: string,
    handle?: UploadHandle,
  ): Promise<UploadResult> {
    const signal = this.abortController.signal;
    this.file = file;
    this.uploadSessionToken = uploadSessionToken;

    const status = await this.httpClient.getUploadStatus(
      uploadSessionId,
      this.uploadSessionToken,
      signal,
    );

    this.session = {
      uploadSessionId,
      totalParts: status.totalParts,
      chunkSizeBytes: status.chunkSizeBytes,
      fileSize: status.fileSize,
    };
    if (handle) {
      handle.uploadSessionId = uploadSessionId;
      handle.uploadSessionToken = this.uploadSessionToken;
      if (status.fileId) {
        handle.fileId = status.fileId;
      }
    }

    const recordedParts = status.recordedParts || status.uploadedParts || [];
    this.completedParts = new Set(recordedParts);
    this.bytesUploaded = this.calculateUploadedBytes(status);

    this.emitProgress();

    await this.uploadAllParts(signal);

    const result = await this.httpClient.completeUpload(
      uploadSessionId,
      this.uploadSessionToken,
      signal,
    );
    if (handle) {
      handle.fileId = result.fileId;
    }
    return result;
  }

  private calculateUploadedBytes(status: UploadStatusResponse): number {
    let bytes = 0;
    const recordedParts = status.recordedParts || status.uploadedParts || [];
    for (const partNum of recordedParts) {
      if (partNum < status.totalParts) {
        bytes += status.chunkSizeBytes;
      } else {
        bytes +=
          status.fileSize - (status.totalParts - 1) * status.chunkSizeBytes;
      }
    }
    return bytes;
  }

  private async uploadAllParts(signal: AbortSignal): Promise<void> {
    if (!this.session || !this.file) {
      throw new Error("No active session");
    }

    for (let partNum = 1; partNum <= this.session.totalParts; partNum++) {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      if (this.completedParts.has(partNum)) {
        continue;
      }

      await this.uploadPart(partNum, signal);
    }
  }

  private async uploadPart(
    partNumber: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.session || !this.file) {
      throw new Error("No active session");
    }

    const { uploadSessionId, chunkSizeBytes, totalParts, fileSize } =
      this.session;

    const start = (partNumber - 1) * chunkSizeBytes;
    const end = partNumber === totalParts ? fileSize : start + chunkSizeBytes;
    const chunk = this.file.slice(start, end);

    const signResponse = await this.httpClient.signPart(
      uploadSessionId,
      partNumber,
      chunk.size,
      this.uploadSessionToken,
      signal,
    );

    const { etag, recorded } = await this.httpClient.uploadPartToSignedUrl(
      signResponse.url,
      signResponse.headers || {},
      chunk,
      this.uploadSessionToken,
      signal,
    );

    if (!recorded) {
      await this.httpClient.completePart(
        uploadSessionId,
        partNumber,
        etag,
        chunk.size,
        this.uploadSessionToken,
        signal,
      );
    }

    this.completedParts.add(partNumber);
    this.bytesUploaded += chunk.size;
    this.emitProgress();
  }

  private emitProgress(): void {
    if (!this.session) return;

    const progress: UploadProgress = {
      bytesUploaded: this.bytesUploaded,
      bytesTotal: this.session.fileSize,
      partsCompleted: this.completedParts.size,
      totalParts: this.session.totalParts,
    };

    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch {
        // Ignore callback errors
      }
    }
  }
}
