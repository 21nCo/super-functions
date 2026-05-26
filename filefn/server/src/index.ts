import type { Adapter } from '@superfunctions/db';
import { wrapWithSchema } from '@superfunctions/db';
import type { StorageAdapter } from '@superfunctions/storage';
import type { FileProvider } from '@superfunctions/files';
import { type RateLimiter, createRateLimiter } from '@superfunctions/middleware';
import { getSchema } from './schema.js';
import { createNucleusPolicies, createPolicyRegistry, type Policy } from './policies.js';
import { createEventEmitter, type FileFnEventEmitter } from './events.js';
import { createUploadSessionService, type QuotaProvider } from './upload-sessions/service.js';
import { createUploadSessionRoutes } from './upload-sessions/routes.js';
import { createFileService, type Authorizer } from './files/service.js';
import { createFileRoutes } from './files/routes.js';
import { createDeduplicationService } from './dedup/service.js';
import { createGrantsService } from './authz/grants.service.js';
import { createGrantsRoutes } from './authz/grants.routes.js';
import { createSharesService } from './shares/service.js';
import { createSharesRoutes } from './shares/routes.js';
import { createProcessingService, type Processor, type FlowFnProvider } from './processing/service.js';
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

export interface FileFnConfig {
  db: Adapter;
  storage: StorageAdapter;
  policies?: Policy[];
  auth?: AuthConfig;
  quota?: QuotaProvider;
  rateLimiter?: RateLimiter;
  rateLimit?: {
    persistence?: any;
    algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket';
    limits?: FileFnRouteRateLimits;
  };
  logger?: Logger;
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

export interface FileFn extends FileProvider {
  router: FileFnRouter;
  events: FileFnEventEmitter;
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
    db: inputDb,
    storage,
    policies: initialPolicies = [],
    auth = {},
    quota,
    rateLimiter,
    rateLimit,
    logger,
    authorizer,
    namespace = 'filefn',
    defaultChunkSizeBytes,
    uploadSessionTtlSeconds,
    signedUrlTtlSeconds,
    dedup,
    processing: processingConfig,
  } = config;
  const db = wrapWithSchema(inputDb, getSchema({ namespace }));

  const policyRegistry = createPolicyRegistry(initialPolicies);
  const events = createEventEmitter();
  const deduplication = createDeduplicationService({
    db,
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

    finalRateLimiter = createRateLimiter({
      windowMs: (seedLimit?.windowSeconds || 60) * 1000,
      maxRequests: seedLimit?.maxRequests || 100,
      persistence: rateLimit.persistence,
      algorithm: rateLimit.algorithm,
    });
  }

  const legacyGlobalRateLimit = Boolean(rateLimiter && !rateLimit);

  // Create file service first so we can use it for authorization checks
  const fileService = createFileService({
    db,
    storage,
    policies: policyRegistry,
    events,
    logger,
    quota,
    authorizer,
    namespace,
    signedUrlTtlSeconds,
  });

  const processingService = createProcessingService({
    db,
    storage,
    policies: policyRegistry,
    events,
    processors: processingConfig?.processors,
    flowFn: processingConfig?.flowFn,
    logger,
    namespace,
    enabled: processingConfig?.enabled ?? false,
  });

  const uploadService = createUploadSessionService({
    db,
    storage,
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
    db,
    namespace,
  });

  const grantsRoutes = createGrantsRoutes({
    service: grantsService,
    auth,
  });

  const sharesService = createSharesService({
    db,
    storage,
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

  const router = createRouter({ uploadRoutes, fileRoutes, grantsRoutes, sharesRoutes, processingRoutes, policyRoutes, quotaRoutes });

  return {
    router,
    events,

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
export type { FileFnEvent, FileFnEventTypes, FileFnEventEmitter } from './events.js';
export { resolvePrincipal } from './auth.js';
export type { AuthConfig, AuthProvider, FileFnPrincipal } from './auth.js';
export type { QuotaProvider } from './upload-sessions/service.js';
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
