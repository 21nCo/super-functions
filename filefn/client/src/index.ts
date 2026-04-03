import { createHttpClient, FileFnHttpError } from './client.js';
import { UploadManager, generateFileId, prepareUploadInput } from './upload-manager.js';
import type {
  ArtifactDescriptor,
  FileFnClientConfig,
  PendingLocalDescriptor,
  RenderDescriptor,
  RenderIntent,
  RenderPlaceholderKind,
  UploadInput,
  UploadHandle,
  UploadHandleWithFileId,
  UploadResult,
} from './types.js';
import type { UploadPreprocessor } from './preprocessing/types.js';
import { createHeicPreprocessor } from './preprocessing/heic.js';

import {
  OPFSStore,
  type PendingUpload,
} from './offline/opfs-store.js';

import {
  OfflineSync,
  shouldUseOfflineMode,
  generateOfflineSessionId,
} from './offline/sync.js';

export type {
  ArtifactDescriptor,
  FileFnClientConfig,
  PendingLocalDescriptor,
  RenderDescriptor,
  RenderIntent,
  RenderPlaceholderKind,
  UploadInput,
  UploadHandle,
  UploadHandleWithFileId,
  UploadProgress,
  UploadResult,
  RetryOptions,
  InitUploadResponse,
  UploadStatusResponse,
  SignPartResponse,
  CompletePartResponse,
  CompleteUploadResponse,
  AbortUploadResponse,
} from './types.js';
export type {
  HeicConversionFunction,
  HeicConversionInput,
  HeicConversionResult,
  HeicPreprocessorOptions,
  PendingLocalPreviewBehavior,
  PendingLocalSourceKind,
  PendingLocalSourceMetadata,
  UploadPreprocessor,
  UploadPreprocessorContext,
  UploadPreprocessorResult,
} from './preprocessing/types.js';

export { FileFnHttpError } from './client.js';
export { resolveRetryOptions, computeDelay, isRetryableError, withRetry } from './retry.js';
export { createHeicPreprocessor, FILEFN_HEIC_CONVERSION_FAILED } from './preprocessing/heic.js';
export { generateFileId } from './upload-manager.js';

export type {
  PendingUpload,
  OPFSStoreConfig,
} from './offline/opfs-store.js';

export {
  OPFSStore,
} from './offline/opfs-store.js';

export type {
  UploadClient,
  SyncConfig,
  SyncProgress,
  SyncResult,
  ConnectivityChecker,
} from './offline/sync.js';

export {
  OfflineSync,
  shouldUseOfflineMode,
  generateOfflineSessionId,
} from './offline/sync.js';

export interface FileFnClient {
  uploadFile(input: UploadInput): UploadHandleWithFileId;
  resumeUpload(
    uploadSessionId: string,
    file: Blob,
    options?: { uploadSessionToken?: string; fileId?: string }
  ): UploadHandle;
  getFile(fileId: string): Promise<Record<string, unknown>>;
  listArtifacts(fileId: string): Promise<ArtifactDescriptor[]>;
  downloadUrl(fileId: string, options?: { versionId?: string }): Promise<string>;
  downloadArtifact(fileId: string, artifactId: string): Promise<string>;
  resolveRenderable(input: {
    fileId: string;
    intent: RenderIntent;
    versionId?: string;
    preferLocal?: boolean;
  }): Promise<RenderDescriptor>;
  deleteFile(fileId: string): Promise<void>;
  getPendingLocalDescriptor(fileId: string): Promise<PendingLocalDescriptor | null>;
}

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function createPlaceholderDescriptor(input: {
  fileId: string;
  versionId: string;
  intent: RenderIntent;
  state: 'processing' | 'unsupported' | 'pending-local';
  mimeType: string;
  name: string;
  size: number;
  placeholderKind: RenderPlaceholderKind;
  warnings?: string[];
}): RenderDescriptor {
  return {
    fileId: input.fileId,
    versionId: input.versionId,
    intent: input.intent,
    state: input.state,
    mimeType: input.mimeType,
    name: input.name,
    size: input.size,
    source: {
      mode: 'placeholder',
      placeholderKind: input.placeholderKind,
    },
    warnings: input.warnings,
  };
}

function resolvePendingLocalRenderable(
  input: { intent: RenderIntent },
  pending: PendingLocalDescriptor,
): RenderDescriptor {
  const base = {
    fileId: pending.fileId,
    versionId: pending.uploadSessionId,
    intent: input.intent,
    mimeType: pending.source.mimeType,
    name: pending.source.fileName,
    size: pending.source.size,
  } as const;

  if (input.intent === 'full' || input.intent === 'download') {
    return {
      ...base,
      state: 'pending-local',
      source: {
        mode: 'original',
        url: pending.source.url,
      },
    };
  }

  if (pending.source.previewBehavior === 'direct-image' && pending.source.kind === 'image') {
    return {
      ...base,
      state: 'pending-local',
      source: {
        mode: 'original',
        url: pending.source.url,
      },
    };
  }

  if (pending.source.previewBehavior === 'direct-pdf' && pending.source.kind === 'pdf') {
    return {
      ...base,
      state: 'pending-local',
      source: {
        mode: 'original',
        url: pending.source.url,
      },
    };
  }

  if (pending.source.kind === 'pdf' || pending.source.previewBehavior === 'deterministic-placeholder') {
    return createPlaceholderDescriptor({
      ...base,
      state: 'pending-local',
      placeholderKind: 'pdf-processing',
      warnings: ['Pending local PDF preview artifact is not available yet.'],
    });
  }

  if (pending.source.mimeType.startsWith('audio/') || pending.source.mimeType.startsWith('video/')) {
    if (input.intent === 'preview') {
      return {
        ...base,
        state: 'pending-local',
        source: {
          mode: 'original',
          url: pending.source.url,
        },
      };
    }
  }

  return createPlaceholderDescriptor({
    ...base,
    state: 'unsupported',
    placeholderKind: input.intent === 'thumbnail' ? 'generic-file' : 'unsupported-preview',
  });
}

function buildPreprocessors(config: FileFnClientConfig): UploadPreprocessor[] {
  const preprocessors: UploadPreprocessor[] = [];
  const heicEnabled = config.preprocessing?.heic?.enabled ?? true;
  if (heicEnabled) {
    preprocessors.push(createHeicPreprocessor(config.preprocessing?.heic));
  }
  if (config.preprocessing?.preprocessors?.length) {
    preprocessors.push(...config.preprocessing.preprocessors);
  }
  return preprocessors;
}

export function createFileFnClient(config: FileFnClientConfig): FileFnClient {
  const httpClient = createHttpClient(config);
  const preprocessors = buildPreprocessors(config);
  
  let offlineSync: OfflineSync | undefined;
  let offlineStore: OPFSStore | undefined;

  function ensureOfflineSupport(): { store: OPFSStore; sync: OfflineSync } {
    if (!config.offline?.enabled) {
      const error = new Error('Offline uploads are disabled') as Error & { code?: string };
      error.code = 'FILEFN_OFFLINE_DISABLED';
      throw error;
    }
    if (!OPFSStore.isSupported()) {
      const error = new Error('OPFS unavailable') as Error & { code?: string };
      error.code = 'FILEFN_OFFLINE_UNSUPPORTED';
      throw error;
    }
    if (!offlineStore || !offlineSync) {
      const store = new OPFSStore({ rootDir: config.offline.opfsDir });
      store.init().catch(() => {});
      offlineStore = store;
      offlineSync = new OfflineSync({
        store,
        client: {
          uploadFile: async (input) => {
            const manager = new UploadManager(httpClient);
            manager.bindAbortSignal(input.signal);
            return manager.startUpload(input);
          }
        }
      });
      offlineSync.startAutoSync();
    }
    return { store: offlineStore, sync: offlineSync };
  }

  return {
    uploadFile(input: UploadInput): UploadHandleWithFileId {
      const normalizedInput: UploadInput = {
        ...input,
        fileId: input.fileId ?? generateFileId(),
      };

      if (config.offline?.enabled && shouldUseOfflineMode(true)) {
        const { store: activeOfflineStore, sync: activeOfflineSync } = ensureOfflineSupport();
        const uploadSessionId = generateOfflineSessionId();
        let aborted = false;
        let rejectStage: ((reason?: unknown) => void) | undefined;
        const stagePromise = new Promise<void>((resolve, reject) => {
          rejectStage = reject;
          void (async () => {
            try {
              const prepared = await prepareUploadInput(normalizedInput, [
                ...preprocessors,
                ...(normalizedInput.preprocessors || []),
              ]);
              if (aborted) {
                throw createAbortError();
              }

              const fileData = await prepared.file.arrayBuffer();
              if (aborted) {
                throw createAbortError();
              }

              const pending: PendingUpload = {
                uploadSessionId,
                fileId: prepared.fileId,
                policy: prepared.policy,
                idempotencyKey: prepared.idempotencyKey,
                fileName: prepared.fileName,
                size: prepared.size,
                mimeType: prepared.mimeType,
                fileData,
                localSource: prepared.localSource,
                metadata: prepared.metadata,
                createdAt: new Date().toISOString(),
                retryCount: 0
              };
              await activeOfflineStore.stagePendingUpload(pending);
              if (aborted) {
                await activeOfflineStore.deletePendingUpload(uploadSessionId);
                throw createAbortError();
              }
              if (activeOfflineSync.isOnline()) {
                void activeOfflineSync.syncUpload(uploadSessionId).catch(() => {});
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          })();
        });
        void stagePromise.catch(() => {});

        const handle: UploadHandleWithFileId = {
          uploadSessionId,
          fileId: normalizedInput.fileId!,
          abort: () => {
            if (aborted) {
              return;
            }
            aborted = true;
            void activeOfflineSync.cancelUpload(uploadSessionId, createAbortError());
            rejectStage?.(createAbortError());
          },
          onProgress: (_cb) => {
            // Staging progress not implemented
          },
          done: async () => {
            if (aborted) {
              throw createAbortError();
            }
            await stagePromise;
            if (aborted) {
              throw createAbortError();
            }
            // Wait for sync to complete when online
            return activeOfflineSync.waitForUpload(uploadSessionId);
          }
        };

        return handle;
      }

      const manager = new UploadManager(httpClient, preprocessors);
      return manager.createHandle(
        normalizedInput,
        (handle) => manager.startUpload(normalizedInput, handle),
      ) as UploadHandleWithFileId;
    },

    resumeUpload(uploadSessionId: string, file: Blob, options?: { uploadSessionToken?: string; fileId?: string }): UploadHandle {
      const manager = new UploadManager(httpClient);
      const dummyInput: UploadInput = { policy: '', file, fileId: options?.fileId };
      return manager.createHandle(
        dummyInput,
        (handle) => manager.resumeUpload(uploadSessionId, file, options?.uploadSessionToken, handle),
        {
          uploadSessionId,
          uploadSessionToken: options?.uploadSessionToken,
          fileId: options?.fileId,
        },
      );
    },

    async getFile(fileId: string): Promise<Record<string, unknown>> {
      return httpClient.getFile(fileId);
    },

    async listArtifacts(fileId: string): Promise<ArtifactDescriptor[]> {
      return httpClient.listArtifacts(fileId);
    },

    async downloadUrl(fileId: string, options?: { versionId?: string }): Promise<string> {
      const response = await httpClient.downloadUrl(fileId, options);
      return response.url;
    },

    async downloadArtifact(fileId: string, artifactId: string): Promise<string> {
      const response = await httpClient.downloadArtifact(fileId, artifactId);
      return response.url;
    },

    async resolveRenderable(input): Promise<RenderDescriptor> {
      if (input.preferLocal && !input.versionId && config.offline?.enabled && OPFSStore.isSupported()) {
        const pending = await (offlineStore ?? ensureOfflineSupport().store).getPendingLocalDescriptor(input.fileId);
        if (pending) {
          return resolvePendingLocalRenderable({ intent: input.intent }, pending);
        }
      }

      return httpClient.getRenderDescriptor(input.fileId, {
        intent: input.intent,
        versionId: input.versionId,
      });
    },

    async deleteFile(fileId: string): Promise<void> {
      await httpClient.deleteFile(fileId);
    },

    async getPendingLocalDescriptor(fileId: string): Promise<PendingLocalDescriptor | null> {
      if (!config.offline?.enabled || !OPFSStore.isSupported()) {
        return null;
      }
      return (offlineStore ?? ensureOfflineSupport().store).getPendingLocalDescriptor(fileId);
    },
  };
}
