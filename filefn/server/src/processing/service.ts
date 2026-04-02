import type { Adapter } from '@superfunctions/db';
import { getStorageCapabilities, type StorageAdapter } from '@superfunctions/storage';
import type { FileProviderContext } from '@superfunctions/files';
import type { FileFnEventEmitter } from '../events.js';
import { resolveArtifactStorageTarget, resolveStorageTarget, type PolicyRegistry } from '../policies.js';
import type { Logger } from '../observability/logger.js';
import * as errors from '../errors.js';

export interface Processor {
  name: string;
  supportedMimeTypes: string[];
  process(
    input: ProcessorInput,
    getData: () => Promise<Uint8Array>
  ): Promise<ProcessorResult>;
}

export interface ProcessorInput {
  fileId: string;
  versionId: string;
  storageKey: string;
  mimeType: string;
  size: number;
  fileName: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessorOutputArtifact {
  kind: string;
  data: Uint8Array;
  mimeType: string;
  storageKey: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessorResult {
  success: boolean;
  artifacts: ProcessorOutputArtifact[];
  error?: string;
}

export interface FlowFnQueue {
  name: string;
  add(job: unknown): Promise<{ jobId: string }>;
}

export interface FlowFnProvider {
  getQueue(name: string): FlowFnQueue | undefined;
}

export interface ProcessingServiceConfig {
  db: Adapter;
  storage: StorageAdapter;
  policies?: Pick<PolicyRegistry, 'get'>;
  events: FileFnEventEmitter;
  processors?: Processor[];
  flowFn?: FlowFnProvider;
  logger?: Logger;
  namespace?: string;
  enabled?: boolean;
  maxFileBytes?: number;
}

export interface FileArtifactRecord {
  artifactId: string;
  fileId: string;
  versionId: string;
  kind: string;
  storageKey: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface FileRecord {
  fileId: string;
  currentVersionId: string;
  ownerId: string;
  tenantId: string | null;
  visibility: 'private' | 'shared' | 'public';
  policy: string;
  name: string;
  mimeType: string;
  size: number;
}

interface FilePermissionRecord {
  fileId: string;
  userId?: string;
  tenantId?: string | null;
  canRead?: boolean;
  expiresAt?: string | null;
}

interface FileVersionRecord {
  versionId: string;
  fileId: string;
  storageKey: string;
  mimeType: string;
  size: number;
}

function generateId(): string {
  return `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function supportsProcessor(processor: Processor, mimeType: string): boolean {
  if (processor.supportedMimeTypes.includes('*/*')) {
    return true;
  }
  return processor.supportedMimeTypes.includes(mimeType);
}

function buildProcessingIdempotencyKey(fileId: string, versionId: string, processors: Processor[]): string {
  const processorKey = processors.map((processor) => processor.name).sort().join(',');
  return `processing:${fileId}:${versionId}:${processorKey}`;
}

function isGrantExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }
  return expiresAtMs <= Date.now();
}

export function createProcessingService(config: ProcessingServiceConfig) {
  const {
    db,
    storage,
    policies,
    events,
    processors = [],
    flowFn,
    logger,
    namespace = 'filefn',
    enabled = true,
    maxFileBytes = 50 * 1024 * 1024,
  } = config;

  const QUEUE_NAME = 'filefn.processing';

  async function getReadableGrantFileIds(ctx: FileProviderContext): Promise<Set<string>> {
    if (!ctx.principalId) {
      return new Set<string>();
    }

    const grants: FilePermissionRecord[] = [];
    grants.push(...await db.findMany<FilePermissionRecord>({
      model: 'filePermissions',
      where: [{ field: 'userId', operator: 'eq', value: ctx.principalId }],
      namespace,
    }));
    if (ctx.tenantId) {
      grants.push(...await db.findMany<FilePermissionRecord>({
        model: 'filePermissions',
        where: [{ field: 'tenantId', operator: 'eq', value: ctx.tenantId }],
        namespace,
      }));
    }

    const readable = new Set<string>();
    for (const grant of grants) {
      if (!grant?.canRead || isGrantExpired(grant.expiresAt)) continue;
      if (
        grant.userId === ctx.principalId ||
        (grant.tenantId && grant.tenantId === ctx.tenantId)
      ) {
        readable.add(grant.fileId);
      }
    }

    return readable;
  }

  function canReadByVisibility(file: FileRecord, ctx: FileProviderContext): boolean {
    if (file.visibility === 'public') return true;
    if (file.ownerId === ctx.principalId) return true;
    if (file.visibility === 'shared' && file.tenantId && file.tenantId === ctx.tenantId) return true;
    return false;
  }

  async function requireReadableFile(fileId: string, ctx: FileProviderContext): Promise<FileRecord> {
    const file = await db.findOne<FileRecord>({
      model: 'files',
      where: [{ field: 'fileId', operator: 'eq', value: fileId }],
      namespace,
    });

    if (!file) {
      throw errors.notFound('File');
    }

    if (canReadByVisibility(file, ctx)) {
      return file;
    }

    const grantFileIds = await getReadableGrantFileIds(ctx);
    if (grantFileIds.has(fileId)) {
      return file;
    }

    throw errors.forbidden();
  }

  async function getVersionChecked(fileId: string, versionId: string): Promise<FileVersionRecord> {
    const version = await db.findOne<FileVersionRecord>({
      model: 'fileVersions',
      where: [{ field: 'versionId', operator: 'eq', value: versionId }],
      namespace,
    });

    if (!version) {
      throw errors.notFound('Version');
    }

    if (version.fileId !== fileId) {
      throw errors.notFound('Version');
    }

    return version;
  }

  async function getReadableVersionForFile(
    fileId: string,
    ctx: FileProviderContext,
    versionId?: string,
  ): Promise<{ file: FileRecord; version: FileVersionRecord }> {
    const file = await requireReadableFile(fileId, ctx);
    const version = await getVersionChecked(fileId, versionId || file.currentVersionId);
    return { file, version };
  }

  function getFileStorageTarget(file: Pick<FileRecord, 'policy'>): string {
    return resolveStorageTarget(policies?.get(file.policy) ?? {});
  }

  function getArtifactStorageTarget(file: Pick<FileRecord, 'policy'>): string {
    return resolveArtifactStorageTarget(policies?.get(file.policy) ?? {});
  }

  async function getBoundArtifact(fileId: string, artifactId: string): Promise<FileArtifactRecord> {
    const artifact = await db.findOne<FileArtifactRecord>({
      model: 'fileArtifacts',
      where: [{ field: 'artifactId', operator: 'eq', value: artifactId }],
      namespace,
    });

    if (!artifact) {
      throw errors.notFound('Artifact');
    }

    if (artifact.fileId !== fileId) {
      throw errors.notFound('Artifact');
    }

    return artifact;
  }

  return {
    isEnabled(): boolean {
      return enabled && processors.length > 0;
    },

    async triggerProcessing(
      input: {
        fileId: string;
        versionId: string;
        storageKey: string;
        mimeType: string;
        size: number;
        fileName: string;
        tenantId?: string;
      },
      ctx: FileProviderContext
    ): Promise<{ enqueued: boolean; jobId?: string }> {
      if (!enabled || processors.length === 0) {
        return { enqueued: false };
      }

      events.emit('processing.started' as any, {
        type: 'processing.started',
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        fileId: input.fileId,
        versionId: input.versionId,
      });

      if (flowFn) {
        const queue = flowFn.getQueue(QUEUE_NAME);
        if (queue) {
          try {
            const result = await queue.add({
              fileId: input.fileId,
              versionId: input.versionId,
              storageKey: input.storageKey,
              mimeType: input.mimeType,
              size: input.size,
              fileName: input.fileName,
              tenantId: input.tenantId,
              idempotencyKey: buildProcessingIdempotencyKey(input.fileId, input.versionId, processors),
            });
            return { enqueued: true, jobId: result.jobId };
          } catch {
            throw errors.processingEnqueueFailed();
          }
        }
      }

      setImmediate(async () => {
        try {
          await this.runProcessing(input, ctx);
        } catch (error) {
          logger?.error('processing failed', {
            requestId: ctx.requestId,
            fileId: input.fileId,
            versionId: input.versionId,
            error: error instanceof Error ? error.stack ?? error.message : String(error),
          });
          events.emit('processing.failed' as any, {
            type: 'processing.failed',
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            fileId: input.fileId,
            versionId: input.versionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      return { enqueued: false };
    },

    async runProcessing(
      input: ProcessorInput,
      ctx: FileProviderContext
    ): Promise<{ artifactsCreated: number; errors: string[] }> {
      const applicableProcessors = processors.filter((p) =>
        supportsProcessor(p, input.mimeType)
      );

      if (applicableProcessors.length === 0) {
        return { artifactsCreated: 0, errors: [] };
      }

      const file = await db.findOne<FileRecord>({
        model: 'files',
        where: [{ field: 'fileId', operator: 'eq', value: input.fileId }],
        namespace,
      });
      const fileStorageTarget = getFileStorageTarget(file ?? { policy: '' });
      const artifactStorageTarget = getArtifactStorageTarget(file ?? { policy: '' });

      let dataCache: Uint8Array | null = null;
      // Processing currently reads the source into memory once per run; reject overly large inputs early.
      const getData = async (): Promise<Uint8Array> => {
        if (dataCache) return dataCache;

        if (storage.openDownloadStream) {
          const stream = await storage.openDownloadStream({ key: input.storageKey, target: fileStorageTarget });
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          let totalLength = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalLength += value.length;
              if (totalLength > maxFileBytes) {
                throw new Error(
                  `Processing source exceeds ${maxFileBytes} bytes; increase maxFileBytes or use a streaming-friendly processor.`,
                );
              }
              chunks.push(value);
            }
          }
          dataCache = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            dataCache.set(chunk, offset);
            offset += chunk.length;
          }
        } else {
          throw new Error('Storage adapter does not support streaming downloads');
        }

        return dataCache;
      };

      const processingErrors: string[] = [];
      let artifactsCreated = 0;

      for (const processor of applicableProcessors) {
        try {
          const result = await processor.process(input, getData);

          if (!result.success) {
            if (result.error) {
              processingErrors.push(`${processor.name}: ${result.error}`);
            }
            continue;
          }

          for (const artifact of result.artifacts) {
            if (storage.openUploadStream) {
              const stream = await storage.openUploadStream({
                key: artifact.storageKey,
                target: artifactStorageTarget,
                contentType: artifact.mimeType,
              });
              const writer = stream.getWriter();
              await writer.write(artifact.data);
              await writer.close();
            } else {
              throw new Error('Storage adapter does not support streaming uploads');
            }

            const existingArtifact = await db.findOne<FileArtifactRecord>({
              model: 'fileArtifacts',
              where: [
                { field: 'fileId', operator: 'eq', value: input.fileId },
                { field: 'versionId', operator: 'eq', value: input.versionId },
                { field: 'kind', operator: 'eq', value: artifact.kind },
              ],
              namespace,
            });

            if (existingArtifact) {
              await db.update({
                model: 'fileArtifacts',
                where: [{ field: 'artifactId', operator: 'eq', value: existingArtifact.artifactId }],
                data: {
                  storageKey: artifact.storageKey,
                  mimeType: artifact.mimeType,
                  size: artifact.data.length,
                  metadata: artifact.metadata || {},
                },
                namespace,
              });
            } else {
              const artifactId = generateId();
              await db.create({
                model: 'fileArtifacts',
                data: {
                  artifactId,
                  fileId: input.fileId,
                  versionId: input.versionId,
                  kind: artifact.kind,
                  storageKey: artifact.storageKey,
                  mimeType: artifact.mimeType,
                  size: artifact.data.length,
                  metadata: artifact.metadata || {},
                  createdAt: new Date().toISOString(),
                },
                namespace,
              });
            }

            artifactsCreated++;
          }
        } catch (error) {
          processingErrors.push(
            `${processor.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      events.emit('processing.completed' as any, {
        type: 'processing.completed',
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        fileId: input.fileId,
        versionId: input.versionId,
        artifactsCreated,
      });

      return { artifactsCreated, errors: processingErrors };
    },

    async listArtifacts(
      fileId: string,
      ctx: FileProviderContext
    ): Promise<FileArtifactRecord[]> {
      void ctx;

      const artifacts = await db.findMany<FileArtifactRecord>({
        model: 'fileArtifacts',
        where: [{ field: 'fileId', operator: 'eq', value: fileId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        namespace,
      });

      return artifacts;
    },

    async listArtifactsForFile(
      fileId: string,
      ctx: FileProviderContext,
    ): Promise<FileArtifactRecord[]> {
      await requireReadableFile(fileId, ctx);
      return this.listArtifacts(fileId, ctx);
    },

    async getArtifactDownloadUrl(
      artifactId: string,
      ctx: FileProviderContext
    ): Promise<{ url: string; headers?: Record<string, string> }> {
      const artifact = await db.findOne<FileArtifactRecord>({
        model: 'fileArtifacts',
        where: [{ field: 'artifactId', operator: 'eq', value: artifactId }],
        namespace,
      });

      if (!artifact) {
        throw errors.notFound('Artifact');
      }

      const file = await db.findOne<FileRecord>({
        model: 'files',
        where: [{ field: 'fileId', operator: 'eq', value: artifact.fileId }],
        namespace,
      });
      if (file) {
        await requireReadableFile(file.fileId, ctx);
      }
      const artifactStorageTarget = getArtifactStorageTarget(file ?? { policy: '' });

      if (getStorageCapabilities(storage, artifactStorageTarget).signedDownloadUrls && storage.signDownloadUrl) {
        const result = await storage.signDownloadUrl({
          key: artifact.storageKey,
          target: artifactStorageTarget,
          expiresInSeconds: 900,
        });
        return { url: result.url, headers: result.headers };
      }

      return { url: `/proxy/files/${artifact.fileId}/artifacts/${artifact.artifactId}/download` };
    },

    async getArtifactDownloadUrlForFile(
      fileId: string,
      artifactId: string,
      ctx: FileProviderContext,
    ): Promise<{ url: string; headers?: Record<string, string> }> {
      await requireReadableFile(fileId, ctx);
      const artifact = await getBoundArtifact(fileId, artifactId);
      const file = await db.findOne<FileRecord>({
        model: 'files',
        where: [{ field: 'fileId', operator: 'eq', value: fileId }],
        namespace,
      });
      const artifactStorageTarget = getArtifactStorageTarget(file ?? { policy: '' });

      if (getStorageCapabilities(storage, artifactStorageTarget).signedDownloadUrls && storage.signDownloadUrl) {
        const result = await storage.signDownloadUrl({
          key: artifact.storageKey,
          target: artifactStorageTarget,
          expiresInSeconds: 900,
        });
        return { url: result.url, headers: result.headers };
      }

      return { url: `/proxy/files/${fileId}/artifacts/${artifactId}/download` };
    },

    async getArtifactDownloadStreamForFile(
      fileId: string,
      artifactId: string,
      ctx: FileProviderContext,
    ): Promise<{ stream: ReadableStream; contentType: string; size: number }> {
      await requireReadableFile(fileId, ctx);
      const artifact = await getBoundArtifact(fileId, artifactId);

      if (!storage.openDownloadStream) {
        throw new Error('Storage adapter does not support streaming');
      }

      const file = await db.findOne<FileRecord>({
        model: 'files',
        where: [{ field: 'fileId', operator: 'eq', value: fileId }],
        namespace,
      });
      const artifactStorageTarget = getArtifactStorageTarget(file ?? { policy: '' });
      const stream = await storage.openDownloadStream({ key: artifact.storageKey, target: artifactStorageTarget });
      return {
        stream: stream as unknown as ReadableStream,
        contentType: artifact.mimeType,
        size: artifact.size,
      };
    },

    async getReadableVersionForFile(
      fileId: string,
      ctx: FileProviderContext,
      versionId?: string,
    ) {
      return getReadableVersionForFile(fileId, ctx, versionId);
    },
  };
}

export type ProcessingService = ReturnType<typeof createProcessingService>;
