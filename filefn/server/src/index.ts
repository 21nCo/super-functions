import { instrumentAdapter, wrapWithSchema, type Adapter, type RuntimeStores } from '@superfunctions/db';
import { instrumentStorageAdapter, type StorageAdapter } from '@superfunctions/storage';
import type { FileProvider } from '@superfunctions/files';
import { type RateLimiter, createRateLimiter } from '@superfunctions/middleware';
import { applyObservationHeaders } from '@superfunctions/http';
import {
  normalizeObservability,
  type ObservabilityInput,
  type ObservationLogger
} from '@superfunctions/observability';
import { getSchema } from './schema.js';
import { createNucleusPolicies, createPolicyRegistry, type Policy, type PolicyRegistryWithDefine } from './policies.js';
import { createEventEmitter, type FileFnEventEmitter, type FileFnObservationEvent } from './events.js';
import { createUploadSessionService, type QuotaProvider, type UploadSessionService } from './upload-sessions/service.js';
import { createUploadSessionRoutes } from './upload-sessions/routes.js';
import { createFileService, type Authorizer, type FileService } from './files/service.js';
import { createFileRoutes } from './files/routes.js';
import { createDeduplicationService } from './dedup/service.js';
import { createGrantsService, type GrantsService } from './authz/grants.service.js';
import { createGrantsRoutes } from './authz/grants.routes.js';
import { createSharesService, type SharesService } from './shares/service.js';
import { createSharesRoutes } from './shares/routes.js';
import { createProcessingService, type Processor, type FlowFnProvider, type ProcessingService } from './processing/service.js';
import { createProcessingRoutes } from './processing/routes.js';
import { createPolicyRoutes } from './policies.routes.js';
import { createQuotaRoutes } from './quota.routes.js';
import { createRouter, type FileFnRouter } from './router.js';
import type { AuthConfig } from './auth.js';
import type { Logger } from './observability/logger.js';

export interface RateLimitCategory {
  windowSeconds: number;
  maxRequests: number;
}

export interface FileFnRouteRateLimits {
  uploadInit?: RateLimitCategory;
  uploadSign?: RateLimitCategory;
  uploadComplete?: RateLimitCategory;
  download?: RateLimitCategory;
  shareDownload?: RateLimitCategory;
  artifactDownload?: RateLimitCategory;
}

export type FileFnRateLimitMode = 'strict' | 'best-effort' | 'local';

export interface FileFnConfig {
  database?: Adapter;
  /** @deprecated Use `database`. */
  db?: Adapter;
  storage: StorageAdapter;
  stores?: RuntimeStores;
  policies?: Policy[];
  auth?: AuthConfig;
  quota?: QuotaProvider;
  rateLimiter?: RateLimiter;
  rateLimit?: {
    mode?: FileFnRateLimitMode;
    algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket';
    limits?: FileFnRouteRateLimits;
  };
  observability?: ObservabilityInput<FileFnObservationEvent>;
  authorizer?: Authorizer;
  namespace?: string;
  defaultChunkSizeBytes?: number;
  uploadSessionTtlSeconds?: number;
  signedUrlTtlSeconds?: number;
  dedup?: {
    enabled?: boolean;
  };
  processing?: {
    enabled?: boolean;
    processors?: Processor[];
    flowFn?: FlowFnProvider;
  };
}

/** Public domain services bound to the same schema, adapters, policies, and event emitter as FileFn's router. */
export interface FileFnServices {
  files: FileService;
  uploads: UploadSessionService;
  grants: GrantsService;
  shares: SharesService;
  processing: ProcessingService;
  policies: PolicyRegistryWithDefine;
}

export interface FileFn extends FileProvider {
  router: FileFnRouter;
  events: FileFnEventEmitter;
  readonly services: FileFnServices;
  definePolicy(name: string, policy: Omit<Policy, 'name'>): void;
  getSchema(): ReturnType<typeof getSchema>;
}

function hasConfiguredRouteRateLimits(limits?: FileFnRouteRateLimits): boolean {
  if (!limits) return false;
  return Boolean(
    limits.uploadInit ||
    limits.uploadSign ||
    limits.uploadComplete ||
    limits.download ||
    limits.shareDownload ||
    limits.artifactDownload
  );
}

export function createFileFn(config: FileFnConfig): FileFn {
  const {
    database,
    storage,
    stores,
    policies: initialPolicies = [],
    auth = {},
    quota,
    rateLimiter,
    rateLimit,
    observability,
    authorizer,
    namespace = 'filefn',
    defaultChunkSizeBytes,
    uploadSessionTtlSeconds,
    signedUrlTtlSeconds,
    dedup,
    processing: processingConfig,
  } = config;
  const inputDatabase = database ?? config.db;
  if (!inputDatabase) {
    throw new Error('FILEFN_DATABASE_REQUIRED: database is required');
  }
  const observabilityScope = normalizeObservability<FileFnObservationEvent>(observability)?.child({ component: 'filefn' });
  const logger = fileFnLoggerFromObservability(observabilityScope?.logger);
  const db = wrapWithSchema(inputDatabase, getSchema({ namespace }));
  const observedDb = instrumentAdapter(db, {
    observability: observabilityScope?.child({ component: 'filefn.db' }),
    kind: 'db',
  });
  const observedStorage = instrumentStorageAdapter(storage, {
    observability: observabilityScope?.child({ component: 'filefn.storage' }),
    kind: 'storage',
  });

  const policyRegistry = createPolicyRegistry(initialPolicies);
  const events = createEventEmitter(observabilityScope);
  const deduplication = createDeduplicationService({
    db: observedDb,
    policies: policyRegistry,
    namespace,
    enabled: dedup?.enabled ?? false,
  });

  const routeRateLimits = rateLimit?.limits;
  const hasRouteRateLimits = hasConfiguredRouteRateLimits(routeRateLimits);

  if (rateLimit && !hasRouteRateLimits) {
    throw new Error('RATE_LIMIT_CONFIG_INVALID: Missing route-category limits');
  }

  let finalRateLimiter = rateLimiter;
  if (!finalRateLimiter && rateLimit && routeRateLimits) {
    const seedLimit =
      routeRateLimits.uploadInit ||
      routeRateLimits.uploadSign ||
      routeRateLimits.uploadComplete ||
      routeRateLimits.download ||
      routeRateLimits.shareDownload ||
      routeRateLimits.artifactDownload;

    const mode = rateLimit.mode ?? (stores?.atomicKv ? 'strict' : stores?.kv ? 'best-effort' : 'local');
    if (mode === 'strict' && !stores?.atomicKv) {
      throw new Error('FILEFN_ATOMIC_STORE_REQUIRED: rateLimit strict mode requires stores.atomicKv');
    }
    finalRateLimiter = createRateLimiter({
      windowMs: (seedLimit?.windowSeconds || 60) * 1000,
      maxRequests: seedLimit?.maxRequests || 100,
      atomicStore: mode === 'strict' ? stores?.atomicKv : undefined,
      persistence: mode === 'best-effort' ? stores?.kv : undefined,
      algorithm: rateLimit.algorithm,
    });
  }

  const legacyGlobalRateLimit = Boolean(rateLimiter && !rateLimit);

  // Create file service first so we can use it for authorization checks
  const fileService = createFileService({
    db: observedDb,
    storage: observedStorage,
    policies: policyRegistry,
    events,
    logger,
    quota,
    authorizer,
    namespace,
    signedUrlTtlSeconds,
  });

  const processingService = createProcessingService({
    db: observedDb,
    storage: observedStorage,
    policies: policyRegistry,
    events,
    processors: processingConfig?.processors,
    flowFn: processingConfig?.flowFn,
    logger,
    namespace,
    enabled: processingConfig?.enabled ?? false,
  });

  const uploadService = createUploadSessionService({
    db: observedDb,
    storage: observedStorage,
    policies: policyRegistry,
    events,
    logger,
    quota,
    dedup: deduplication,
    fileWriteChecker: fileService,
    processingService,
    namespace,
    defaultChunkSizeBytes,
    uploadSessionTtlSeconds,
    signedUrlTtlSeconds,
  });

  const uploadRoutes = createUploadSessionRoutes({
    service: uploadService,
    auth,
    rateLimiter: finalRateLimiter,
    rateLimits: {
      uploadInit: routeRateLimits?.uploadInit,
      uploadSign: routeRateLimits?.uploadSign,
      uploadComplete: routeRateLimits?.uploadComplete,
    },
    legacyGlobalRateLimit,
  });

  const fileRoutes = createFileRoutes({
    service: fileService,
    auth,
    rateLimiter: finalRateLimiter,
    rateLimits: {
      download: routeRateLimits?.download,
    },
    legacyGlobalRateLimit,
  });

  const grantsService = createGrantsService({
    db: observedDb,
    namespace,
  });

  const grantsRoutes = createGrantsRoutes({
    service: grantsService,
    auth,
  });

  const sharesService = createSharesService({
    db: observedDb,
    storage: observedStorage,
    policies: policyRegistry,
    namespace,
    signedUrlTtlSeconds,
  });

  const sharesRoutes = createSharesRoutes({
    service: sharesService,
    auth,
    rateLimiter: finalRateLimiter,
    rateLimits: {
      shareDownload: routeRateLimits?.shareDownload,
    },
  });

  const processingRoutes = createProcessingRoutes({
    service: processingService,
    auth,
    rateLimiter: finalRateLimiter,
    rateLimits: {
      artifactDownload: routeRateLimits?.artifactDownload,
    },
  });

  const policyRoutes = createPolicyRoutes({
    policyRegistry,
    auth,
  });

  const quotaRoutes = createQuotaRoutes({
    quota,
    auth,
  });

  const baseRouter = createRouter({ uploadRoutes, fileRoutes, grantsRoutes, sharesRoutes, processingRoutes, policyRoutes, quotaRoutes });
  const router: FileFnRouter = observabilityScope
    ? {
        async handle(request) {
          const existing = observabilityScope.getCurrentRequest();
          if (existing) {
            return baseRouter.handle(request);
          }
          const observation = observabilityScope.startRequest({ request });
          const response = await observabilityScope.runWithRequest(
            observation,
            () => baseRouter.handle(request),
          );
          const snapshot = observation.finish({
            status: response?.status ?? 404,
          });
          if (!response) {
            return response;
          }
          const headers = new Headers(response.headers);
          applyObservationHeaders(headers, snapshot, {
            serverTiming: true,
            headers: { prefix: 'x-filefn' },
          });
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        },
      }
    : baseRouter;

  return {
    router,
    events,
    services: {
      files: fileService,
      uploads: uploadService,
      grants: grantsService,
      shares: sharesService,
      processing: processingService,
      policies: policyRegistry,
    },

    definePolicy(name: string, policy: Omit<Policy, 'name'>): void {
      policyRegistry.define(name, policy);
    },

    getSchema() {
      return getSchema({ namespace });
    },

    // FileProvider implementation
    async createUploadSession(input, ctx) {
      return uploadService.createSession(input, ctx);
    },

    async getUploadSessionStatus(input, ctx) {
      const uploadSessionToken = (ctx as any)?.uploadSessionToken as string | undefined;
      return uploadService.getSessionStatus(input.uploadSessionId, ctx, uploadSessionToken);
    },

    async signUploadPart(input, ctx) {
      const uploadSessionToken = (ctx as any)?.uploadSessionToken as string | undefined;
      return uploadService.signPart(input.uploadSessionId, input.partNumber, input.contentLength, ctx, uploadSessionToken);
    },

    async completeUploadPart(input, ctx) {
      const uploadSessionToken = (ctx as any)?.uploadSessionToken as string | undefined;
      await uploadService.completePart(input.uploadSessionId, input.partNumber, input.etag, input.size, ctx, uploadSessionToken);
    },

    async completeUploadSession(input, ctx) {
      const uploadSessionToken = (ctx as any)?.uploadSessionToken as string | undefined;
      return uploadService.completeSession(input.uploadSessionId, ctx, uploadSessionToken);
    },

    async abortUploadSession(input, ctx) {
      const uploadSessionToken = (ctx as any)?.uploadSessionToken as string | undefined;
      await uploadService.abortSession(input.uploadSessionId, ctx, uploadSessionToken);
    },

    async getFile(input, ctx) {
      return fileService.getFile(input.fileId, ctx, input.versionId);
    },

    async listFiles(input, ctx) {
      return fileService.listFiles(ctx, input);
    },

    async deleteFile(input, ctx) {
      await fileService.deleteFile(input.fileId, ctx);
    },
  };
}

// Re-exports
export { getSchema, getSchemaMap } from './schema.js';
export {
  DEFAULT_STORAGE_TARGET,
  NUCLEUS_ALLOWED_CONTENT_TYPES,
  NUCLEUS_MAX_SIZE_BYTES,
  computeStoragePath,
  createNucleusPolicies,
  createPolicyRegistry,
  matchesContentType,
  resolveArtifactStorageTarget,
  resolveStorageTarget,
  validatePolicyConstraints,
} from './policies.js';
export type { Policy, PolicyRegistry, Visibility } from './policies.js';
export { createEventEmitter } from './events.js';
export type {
  FileDeletedEvent,
  FileFnEvent,
  FileFnEventEmitter,
  FileFnEventType,
  FileFnEventTypes,
  FileFnObservationEvent,
  FileFnObservationEventMap,
  FileFnObservationMetadata,
  FileUploadedEvent,
  PartRecordedEvent,
  ProcessingCompletedEvent,
  ProcessingFailedEvent,
  ProcessingStartedEvent,
  UploadStartedEvent,
} from './events.js';
export { resolvePrincipal } from './auth.js';
export type { AuthConfig, AuthProvider, FileFnPrincipal } from './auth.js';
export { createUploadSessionService } from './upload-sessions/service.js';
export type { QuotaProvider, UploadSessionService, CreateSessionInput, UploadSession } from './upload-sessions/service.js';
export { createFileService } from './files/service.js';
export type { FileService, FileRecord, FileVersionRecord, Authorizer } from './files/service.js';
export * from './errors.js';
export type { FileFnRouter } from './router.js';

// Authorization exports
export { composeAuthorizers, createDefaultAuthorizer } from './authz/authorizer.js';
export type { AuthorizerStrategy, ComposeAuthorizersOptions, FilePermissionRecord, DefaultAuthorizerConfig } from './authz/authorizer.js';
export { createGrantsService } from './authz/grants.service.js';
export type { GrantsService, CreateGrantInput } from './authz/grants.service.js';
export { createGrantsRoutes } from './authz/grants.routes.js';
export type { GrantsRoutes, GrantsRouteContext } from './authz/grants.routes.js';

// Share link exports
export { createSharesService } from './shares/service.js';
export type { SharesService, FileShareRecord, CreateShareLinkInput } from './shares/service.js';
export { createSharesRoutes } from './shares/routes.js';
export type { SharesRoutes, SharesRouteContext } from './shares/routes.js';

// Observability exports
export { createLogger, redactSecrets } from './observability/logger.js';
export type { Logger, LogContext, LoggerOptions } from './observability/logger.js';

// Processing exports
export { createProcessingService } from './processing/service.js';
export type {
  ProcessingService,
  Processor,
  ProcessorInput,
  ProcessorOutputArtifact,
  ProcessorResult,
  FileArtifactRecord,
  FlowFnProvider,
  FlowFnQueue,
} from './processing/service.js';
export { createProcessingRoutes } from './processing/routes.js';
export type { ProcessingRoutes, ProcessingRoutesConfig } from './processing/routes.js';

function fileFnLoggerFromObservability(logger: ObservationLogger | undefined): Logger | undefined {
  if (!logger) {
    return undefined;
  }
  return {
    info: (message, context) => logger.info?.(message, context),
    warn: (message, context) => logger.warn?.(message, context),
    error: (message, context) => logger.error?.(message, context),
    debug: (message, context) => logger.debug?.(message, context),
  };
}
