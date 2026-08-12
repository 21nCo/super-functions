/**
 * DataFn Server Factory
 * Creates a Router with datafn endpoints
 */

import type { RetentionConfig, RateLimitConfig, ObservabilityConfig } from "./core-types.js";
import type { DatafnPlugin, DatafnResourceSchema, DatafnSchema } from "@datafn/core/types";
import type { SearchProvider } from "./search-provider.js";
import { validateSchema, ensureBuiltinKv, isNamespaced } from "@datafn/core";
import { createRouter, type Router, type Route, type RouteHandler } from "@superfunctions/http";
import type { Adapter, RedisAdapter, KVStoreAdapter, RowLevelNamespaceConfig } from "@superfunctions/db";
import { wrapWithRowLevelNamespace } from "@superfunctions/db";
import type { DbMapping, SequenceStore } from "./execution/sync/sequence-store.js";
import { createSequenceStore } from "./execution/sync/sequence-store.js";
import { createStatusHandler } from "./routes/status.js";
import { createQueryHandler } from "./routes/query.js";
import { createMutationHandler } from "./routes/mutation.js";
import { createTransactHandler } from "./routes/transact.js";
import {
  createCloneHandler,
  createPullHandler,
  createPushHandler,
  createReconcileHandler,
} from "./routes/sync.js";
import { createSeedHandler } from "./routes/seed.js";
import { createSearchHandler } from "./routes/search.js";
import { executeCrossResourceSearch } from "./execution/search/cross-resource.js";
import {
  executeDbNativeCrossResourceSearch,
  hasDbNativeSearchSupport,
  NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
} from "./execution/search/native-fallback.js";
import { DbIdempotencyStore } from "./execution/idempotency-db.js";
import { ChangeTrackingService } from "./execution/sync/change-tracking.js";
import { errorResponse, errorToEnvelope } from "./http/errors.js";
import { createRestRoutes } from "./routes/rest.js";
import { checkPayloadLimit, readBodyWithLimit } from "./http/middleware.js";
import { parseJsonBody } from "./http/json.js";
import { WebSocketManager, type WebSocketClient, type WsAuthContext } from "./ws.js";
import type { WsManagerConfig } from "./ws.js";
import {
  RedisRateLimiter,
  MemoryRateLimiter,
  createRateLimitMiddleware,
} from "./middleware/rate-limit.js";
import { createTimingEmitter, type TimingEmitter } from "./middleware/timing.js";
import { createDefaultLogger, type DatafnLogger } from "./logger.js";
import { DatafnExecutionError } from "./execution/errors.js";
import {
  setSpv2MigrationRuntimeConfig,
  type Spv2MigrationRuntimeConfig,
} from "./execution/migration/spv2.js";

/**
 * Server configuration
 */
export interface DatafnServerConfig<TContext = any> {
  /** DataFn schema (will be validated at startup) */
  schema: DatafnSchema;

  /** Database adapter (required for persistence) */
  db?: Adapter;

  /** Optional plugins */
  plugins?: DatafnPlugin[];

  /** Optional authorization callback */
  authorize?: (
    ctx: TContext,
    action:
      | "status"
      | "query"
      | "mutation"
      | "transact"
      | "seed"
      | "clone"
      | "pull"
      | "push"
      | "reconcile"
      | "search",
    payload: unknown,
  ) => Promise<boolean> | boolean;

  /** Optional request context factory passed through to namespace, actor, auth, and route handlers. */
  context?: TContext | ((request: Request) => Promise<TContext> | TContext);

  /** Optional limits configuration */
  limits?: {
    maxLimit?: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
    /** Max changes returned per pull request. Default: 1000. */
    maxPullLimit?: number;
    /** VAL-002: Max select tokens per query (default 50) */
    maxSelectTokens?: number;
    /** VAL-003: Max filter keys per nesting level (default 20) */
    maxFilterKeysPerLevel?: number;
    /** VAL-004: Max sort fields (default 10) */
    maxSortFields?: number;
    /** VAL-005: Max aggregations (default 20) */
    maxAggregations?: number;
    /** VAL-006: Max ID length (default 255) */
    maxIdLength?: number;
    /** FIX-SEC-006: Max batch size for push/mutation endpoints (default 500) */
    maxBatchSize?: number;
    /** FIX-SRV-003: Max in-flight query concurrency for batch queries (default 20) */
    maxBatchQueryConcurrency?: number;
  };

  /**
   * VAL-009: Debug mode for validation error messages.
   * When false, error messages are generic (no field names or schema details).
   * Default: process.env.NODE_ENV !== 'production'
   */
  debug?: boolean;

  /**
   * VAL-001: Allow queries/mutations on resources with no authorization policy.
   * When false (default), resources without a policy return FORBIDDEN.
   * Set to true only for development/testing.
   */
  allowUnknownResources?: boolean;

  /** Optional server time provider (for testing) */
  getServerTime?: () => number;

  /**
   * Optional flag to enable REST endpoint generation (default: false)
   * When true, generates REST wrappers:
   * - GET /datafn/resources/:resource (query wrapper)
   * - POST /datafn/resources/:resource (insert/merge wrapper)
   * - PATCH /datafn/resources/:resource/:id (merge wrapper)
   * - DELETE /datafn/resources/:resource/:id (delete wrapper)
   */
  rest?: boolean;

  /**
   * Namespace provider for per-request data isolation.
   * Returns the namespace string used to scope all data operations.
   * Without this, all data shares the default "datafn" namespace.
   *
   * @example
   * ```typescript
   * namespaceProvider: {
   *   getNamespace: (ctx) => ns(ctx.orgId, ctx.userId),
   *   getActorId: (ctx) => ctx.userId,
   * }
   * ```
   */
  namespaceProvider?: {
    getNamespace: (ctx: TContext) => string | Promise<string>;
    /** Optional actor ID for audit attribution (separate from isolation). */
    getActorId?: (ctx: TContext) => string | undefined | Promise<string | undefined>;
  };

  /**
   * Optional Redis adapter for atomic operations (serverSeq, rate limiting, caching).
   * When provided with appropriate dbMapping, enables high-performance atomic operations.
   * 
   * @example
   * ```typescript
   * redis: myRedisAdapter,
   * dbMapping: { serverseq: "redis" }
   * ```
   */
  redis?: RedisAdapter;

  /**
   * Optional KV store adapter for simple key-value operations.
   * Must support `incr()` to be used for serverSeq generation.
   * 
   * @example
   * ```typescript
   * kvStore: myKVAdapter,
   * dbMapping: { serverseq: "kv" }
   * ```
   */
  kvStore?: KVStoreAdapter;

  /**
   * Database mapping configuration - specifies which database to use for each feature.
   * Defaults to using the main database ("db") for all features.
   * 
   * @example
   * ```typescript
   * dbMapping: {
   *   serverseq: "redis",     // Use Redis for serverSeq (atomic INCR)
   *   ratelimiting: "redis",  // Use Redis for rate limiting
   *   cache: "kv",            // Use KV store for caching
   * }
   * ```
   */
  dbMapping?: DbMapping;

  /**
   * Row-level namespace isolation configuration.
   * - Explicitly `false` → disabled.
   * - Object → used as-is for wrapping configuration.
   */
  rowLevelNamespace?: false | RowLevelNamespaceConfig;

  /** Data retention configuration for __datafn_changes and __datafn_idempotency tables. */
  retention?: RetentionConfig;

  /** Rate limiting configuration (RATE-001 through RATE-005). */
  rateLimit?: RateLimitConfig<TContext>;

  /** Observability configuration (OBS-001 through OBS-004). */
  observability?: ObservabilityConfig;

  /**
   * WebSocket limits and heartbeat configuration.
   * SCA-005: maxConnections / maxConnectionsPerNamespace
   * REL-007: heartbeatIntervalMs / heartbeatTimeoutMs
   */
  ws?: WsManagerConfig;

  /**
   * Graceful shutdown drain timeout in ms. Default: 10,000.
   * REL-009: Server waits up to this long for in-flight requests to complete.
   */
  shutdownTimeoutMs?: number;

  /**
   * LOG-001: Pluggable logger. Default: console-based (JSON in prod, pretty in dev).
   */
  logger?: DatafnLogger;

  /**
   * COMP-001: SPV2 migration compatibility flags.
   * - readMode: v2 (default), dual, or v1 (rollback mode)
   * - writeMode: v2 (default) or dual
   * - warnOnLegacyApi: emit deterministic deprecation warnings for shareWith.userId
   */
  spv2Migration?: Spv2MigrationRuntimeConfig;

  /**
   * Optional search provider for full-text and semantic search queries.
   * When provided, search queries are routed to this provider instead of requiring a searchfn plugin.
   */
  searchProvider?: SearchProvider;
}

/**
 * Server instance
 */
export interface DatafnServer<TContext = any> {
  router: Router<TContext>;
  search(
    params: import("./execution/search/cross-resource.js").CrossResourceSearchParams & {
      namespace?: string;
    },
    ctx?: TContext,
  ): Promise<import("./execution/search/cross-resource.js").SearchResult>;
  websocketHandler: {
    /** SEC-001: addClient requires auth context. Reject unauthenticated connections with close code 4401 before calling. */
    /** SCA-005: Returns false (and closes with code 4503) when connection limits are exceeded. */
    addClient(client: WebSocketClient, authContext: WsAuthContext): boolean;
    removeClient(client: WebSocketClient): void;
    handleMessage(client: WebSocketClient, data: string): void;
    /** REL-007: Called by WS transport on native pong frame receipt. */
    handlePong(client: WebSocketClient): void;
  };
  /**
   * Graceful shutdown:
   * 1. Rejects new requests with 503
   * 2. Sends WS close frame 1001 to all clients
   * 3. Waits for in-flight requests to complete (up to shutdownTimeoutMs)
   * 4. Clears timers
   * REL-009
   */
  close(): Promise<void>;
}

/**
 * Create a DataFn server
 */
export async function createDatafnServer<TContext = any>(
  config: DatafnServerConfig<TContext>,
): Promise<DatafnServer<TContext>> {
  // Validate schema at startup
  const schemaValidation = validateSchema(config.schema);
  if (!schemaValidation.ok) {
    throw new Error(
      `Schema validation failed: ${schemaValidation.error.message}`,
    );
  }

  // Ensure built-in KV resource exists (KV-001)
  const validatedSchema = ensureBuiltinKv(schemaValidation.result);

  // VAL-009: Debug mode — default to true in non-production
  const debugMode = config.debug ?? (process.env.NODE_ENV !== "production");

  // LOG-001: Pluggable logger — default console-based
  const logger: DatafnLogger = config.logger ?? createDefaultLogger(debugMode);

  // COMP-001/COMP-002: configure migration compatibility mode for this server instance.
  setSpv2MigrationRuntimeConfig(config.spv2Migration);

  // Initialize database adapter if provided and implements Adapter interface
  if (
    config.db &&
    typeof config.db === "object" &&
    "initialize" in config.db &&
    typeof config.db.initialize === "function"
  ) {
    await config.db.initialize();
  }

  // Row-level namespace auto-wrapping (DFN-001)
  // When schema has namespace isolation enabled (the default) and rowLevelNamespace is not explicitly false,
  // wrap the adapter so all CRUD operations are namespace-isolated.
  // This activates for SQL-backed adapters (which have __ns NOT NULL columns from codegen)
  // regardless of whether a namespace provider is present — without one, the default "datafn"
  // namespace is used. For in-memory adapters (no schema constraints), wrapping is only
  // applied when a namespace/auth provider is present (explicit namespace isolation).
  let db = config.db;
  const schemaIsNamespaced = isNamespaced(validatedSchema);
  const adapterHasSchemaConstraints = db?.capabilities?.schema?.constraints === true;
  const hasNamespaceProvider = !!config.namespaceProvider;
  const shouldWrapNamespace = db && schemaIsNamespaced && config.rowLevelNamespace !== false
    && (adapterHasSchemaConstraints || hasNamespaceProvider || (typeof config.rowLevelNamespace === 'object' && config.rowLevelNamespace));
  if (shouldWrapNamespace) {
    const rlnConfig: RowLevelNamespaceConfig =
      typeof config.rowLevelNamespace === 'object' && config.rowLevelNamespace
        ? config.rowLevelNamespace
        : { enabled: true, columnName: '__ns', mandatory: true };

    if (rlnConfig.enabled && db) {
      const internal = db.internal; // preserve original internal (already bypassed by wrapper, but be explicit)
      db = wrapWithRowLevelNamespace(db, rlnConfig);
      // Ensure internal is the original unwrapped internal
      (db as any).internal = internal;
    }
  }

  // Startup pruning (RET-004)
  if (config.retention?.pruneOnStartup && db) {
    try {
      const ct = new ChangeTrackingService(db!, "datafn", undefined, undefined, logger);
      if (config.retention.changeLogDays) {
        const deleted = await ct.pruneChanges(config.retention.changeLogDays);
        logger.info("Pruned change log entries", { deleted, operation: "startup-prune" });
      }
      const idempotencyStoreForPrune = db
        ? new DbIdempotencyStore(db, "datafn", logger)
        : undefined;
      if (config.retention.idempotencyDays && idempotencyStoreForPrune) {
        const deleted = await idempotencyStoreForPrune.pruneIdempotency(config.retention.idempotencyDays);
        logger.info("Pruned idempotency entries", { deleted, operation: "startup-prune" });
      }
    } catch (error) {
      logger.warn("Startup pruning failed", { error: String(error), operation: "startup-prune" });
    }
  }

  // Initialize Redis adapter health check if provided
  if (config.redis) {
    try {
      const healthy = await config.redis.isHealthy();
      if (!healthy) {
        logger.warn("Redis adapter health check failed, using main database for secondary operations", { operation: "redis-health" });
      }
    } catch (error) {
      logger.warn("Redis adapter health check error", { error: String(error), operation: "redis-health" });
    }
  }

  // Create sequence store based on configuration (Redis/KV/DB)
  const sequenceStore = createSequenceStore({
    db,
    redis: config.redis,
    kvStore: config.kvStore,
    dbMapping: config.dbMapping,
    logger,
  });

  // VAL-001: allowUnknownResources — default false (deny-by-default)
  const allowUnknownResources = config.allowUnknownResources ?? false;

  // Compute limits with defaults
  const limits = {
    maxLimit: config.limits?.maxLimit ?? 100,
    maxTransactSteps: config.limits?.maxTransactSteps,
    maxPayloadBytes: config.limits?.maxPayloadBytes ?? 5_242_880, // VAL-010
    maxPullLimit: config.limits?.maxPullLimit ?? 1000,
    maxSelectTokens: config.limits?.maxSelectTokens ?? 50,
    maxFilterKeysPerLevel: config.limits?.maxFilterKeysPerLevel ?? 20,
    maxSortFields: config.limits?.maxSortFields ?? 10,
    maxAggregations: config.limits?.maxAggregations ?? 20,
    maxIdLength: config.limits?.maxIdLength ?? 255,
    maxBatchSize: config.limits?.maxBatchSize ?? 500,
    maxBatchQueryConcurrency: config.limits?.maxBatchQueryConcurrency ?? 20,
  };

  // Observability: create timing emitter (OBS-004)
  const timingEmitter = createTimingEmitter(config.observability, logger);

  // Rate limiting setup (RATE-001 through RATE-005)
  let rateLimitMiddleware: ((endpoint: string, ctx: TContext) => Promise<Response | null>) | null = null;
  let memoryRateLimiter: MemoryRateLimiter | null = null;

  if (config.rateLimit?.enabled) {
    const limiter = config.redis
      ? new RedisRateLimiter(config.redis)
      : (() => { const m = new MemoryRateLimiter(); memoryRateLimiter = m; return m; })();

    const defaultKeyExtractor = async (ctx: TContext): Promise<string> => {
      if (config.namespaceProvider) {
        try {
          return await config.namespaceProvider.getNamespace(ctx);
        } catch (error) {
          logger.warn("Namespace provider failed for rate limiting, using anonymous", {
            error: String(error),
            operation: "rate-limit-key",
          });
        }
      }
      return "anonymous";
    };

    rateLimitMiddleware = createRateLimitMiddleware({
      limiter,
      maxRequests: config.rateLimit.maxRequests ?? 100,
      windowSeconds: config.rateLimit.windowSeconds ?? 60,
      endpoints: config.rateLimit.endpoints,
      keyExtractor: config.rateLimit.keyExtractor ?? defaultKeyExtractor,
    });
  }

  // Periodic pruning interval (RET-005)
  let pruneInterval: ReturnType<typeof setInterval> | null = null;
  if (config.retention?.pruneIntervalMs && db) {
    const intervalMs = Math.max(config.retention.pruneIntervalMs, 60000);
    const dbForInterval = db;
    const retentionForInterval = config.retention;
    pruneInterval = setInterval(async () => {
      try {
        const ct = new ChangeTrackingService(dbForInterval, "datafn", undefined, undefined, logger);
        if (retentionForInterval.changeLogDays) {
          const deleted = await ct.pruneChanges(retentionForInterval.changeLogDays);
          logger.info("Periodic prune: removed change log entries", { deleted, operation: "periodic-prune" });
        }
        const idStore = new DbIdempotencyStore(dbForInterval, "datafn", logger);
        if (retentionForInterval.idempotencyDays) {
          const deleted = await idStore.pruneIdempotency(retentionForInterval.idempotencyDays);
          logger.info("Periodic prune: removed idempotency entries", { deleted, operation: "periodic-prune" });
        }
      } catch (e) {
        logger.warn("Periodic prune failed", { error: String(e), operation: "periodic-prune" });
      }
    }, intervalMs);
    // LOW-005: Unref so this timer does not keep the Node.js process alive
    if (pruneInterval && typeof (pruneInterval as NodeJS.Timeout).unref === "function") {
      (pruneInterval as NodeJS.Timeout).unref();
    }
  }

  // Helper to extract namespace
  const extractNamespace = async (ctx: TContext): Promise<string> => {
    if (config.namespaceProvider) {
      const ns = await config.namespaceProvider.getNamespace(ctx);
      if (typeof ns !== "string" || ns === "") {
        const err = new Error("Namespace provider returned empty namespace");
        (err as any).code = "NAMESPACE_INVALID";
        throw err;
      }
      return ns;
    }
    return "datafn";
  };

  // Helper to extract actor ID (for audit attribution)
  const extractActorId = async (ctx: TContext): Promise<string | undefined> => {
    if (config.namespaceProvider?.getActorId) {
      try {
        return await config.namespaceProvider.getActorId(ctx);
      } catch (error) {
        logger.warn("Failed to extract actorId, proceeding without audit attribution", { error: String(error), operation: "extract-actor-id" });
        return undefined;
      }
    }
    return undefined;
  };

  // Create route handlers
  const statusHandler = createStatusHandler(
    validatedSchema,
    {
      maxLimit: limits.maxLimit,
      maxTransactSteps: limits.maxTransactSteps,
      maxPayloadBytes: limits.maxPayloadBytes,
      maxPullLimit: limits.maxPullLimit,
    },
    config.getServerTime,
    db,
  );

  const queryHandler = createQueryHandler(
    validatedSchema,
    limits.maxLimit,
    extractNamespace,
    extractActorId,
    db,
    config.plugins || [],
    config.searchProvider,
    timingEmitter,
    {
      maxSelectTokens: limits.maxSelectTokens,
      maxFilterKeysPerLevel: limits.maxFilterKeysPerLevel,
      maxSortFields: limits.maxSortFields,
      maxAggregations: limits.maxAggregations,
      maxBatchQueryConcurrency: limits.maxBatchQueryConcurrency,
      allowUnknownResources,
      debug: debugMode,
      hasSearchProviderFallback: hasDbNativeSearchSupport(db),
    },
    logger,
  );

  // Create mutation handler and idempotency store
  const idempotencyStore = db
    ? new DbIdempotencyStore(db, "datafn", logger)
    : undefined;

  const mutationHandler = createMutationHandler(
    validatedSchema,
    extractNamespace,
    extractActorId,
    db,
    idempotencyStore,
    config.plugins || [], // Pass plugins
    sequenceStore,
    timingEmitter,
    {
      maxIdLength: limits.maxIdLength,
      maxBatchSize: limits.maxBatchSize,
      allowUnknownResources,
      debug: debugMode,
    },
    logger,
    config.searchProvider,
  );

  const transactHandler = createTransactHandler(
    validatedSchema,
    db,
    idempotencyStore,
    limits,
    extractNamespace,
    extractActorId,
    sequenceStore,
    config.plugins || [],
    {
      allowUnknownResources,
      debug: debugMode,
    },
    logger,
  );

  const cloneHandler = createCloneHandler(
    validatedSchema,
    extractNamespace,
    extractActorId,
    db,
    config.plugins || [],
    sequenceStore,
    logger,
  );
  const pullHandler = createPullHandler(
    validatedSchema,
    extractNamespace,
    extractActorId,
    db,
    config.plugins || [],
    sequenceStore,
    limits.maxPullLimit,
    timingEmitter,
    logger,
  );
  const reconcileHandler = createReconcileHandler(
    validatedSchema,
    extractNamespace,
    extractActorId,
    db,
    config.plugins || [],
    sequenceStore,
    logger,
  );

  // WebSocket Manager (SCA-005 limits, REL-007 heartbeat)
  const wsManager = new WebSocketManager(config.ws ?? {}, logger);

  const pushHandler = createPushHandler(
    validatedSchema,
    extractNamespace,
    extractActorId,
    db,
    idempotencyStore,
    config.plugins || [],
    sequenceStore,
    (seq, namespace) => wsManager.broadcastCursor(String(seq), namespace),
    timingEmitter,
    {
      maxIdLength: limits.maxIdLength,
      maxBatchSize: limits.maxBatchSize,
      allowUnknownResources,
      debug: debugMode,
    },
    logger,
  );
  const seedHandler = createSeedHandler(db, extractNamespace, logger);

  const searchHandler = createSearchHandler(
    validatedSchema,
    extractNamespace,
    db,
    config.searchProvider,
    logger,
  );

  // Initialize search provider if configured
  if (config.searchProvider?.initialize) {
    const resources = validatedSchema.resources
      .map((r: DatafnResourceSchema) => ({
        name: r.name,
        searchFields: Array.isArray(r.indices) ? [] : (r.indices?.search ?? []),
      }))
      .filter((resource: { name: string; searchFields: string[] }) => resource.searchFields.length > 0);
    try {
      await config.searchProvider.initialize({ resources });
    } catch (error) {
      throw new Error(`Search provider initialization failed: ${String(error)}`);
    }
  }

  // In-flight request tracking for graceful shutdown (REL-009)
  let inFlightCount = 0;
  let shuttingDown = false;
  let shutdownResolve: (() => void) | null = null;
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

  // Authorization wrapper
  // AUTH-001: Parse JSON BEFORE authorization. Invalid JSON returns DFQL_INVALID, not FORBIDDEN.
  type DatafnAction =
    | "status"
    | "query"
    | "mutation"
    | "transact"
    | "seed"
    | "clone"
    | "pull"
    | "push"
    | "reconcile"
    | "search";

  const isPlainObjectContext = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object") {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };

  const createEnrichedContext = (
    ctx: TContext,
  ): TContext & { parsedBody?: unknown } => {
    if (isPlainObjectContext(ctx)) {
      return { ...ctx } as TContext & { parsedBody?: unknown };
    }

    if (ctx && typeof ctx === "object") {
      let parsedBody: unknown;
      let hasParsedBody = false;
      const target = ctx as Record<PropertyKey, unknown>;
      return new Proxy(target, {
        get(currentTarget, prop) {
          if (prop === "parsedBody") {
            if (hasParsedBody) {
              return parsedBody;
            }
            return Reflect.get(currentTarget, prop, currentTarget);
          }
          const value = Reflect.get(currentTarget, prop, currentTarget);
          return typeof value === "function" ? value.bind(currentTarget) : value;
        },
        set(currentTarget, prop, value) {
          if (prop === "parsedBody") {
            hasParsedBody = true;
            parsedBody = value;
            return true;
          }
          return Reflect.set(currentTarget, prop, value, currentTarget);
        },
        has(currentTarget, prop) {
          if (prop === "parsedBody") {
            return hasParsedBody || Reflect.has(currentTarget, prop);
          }
          return Reflect.has(currentTarget, prop);
        },
        ownKeys(currentTarget) {
          const keys = Reflect.ownKeys(currentTarget);
          if (hasParsedBody && !keys.includes("parsedBody")) {
            return [...keys, "parsedBody"];
          }
          return keys;
        },
        getOwnPropertyDescriptor(currentTarget, prop) {
          if (prop === "parsedBody") {
            if (!hasParsedBody) {
              return Reflect.getOwnPropertyDescriptor(currentTarget, prop);
            }
            return {
              configurable: true,
              enumerable: true,
              writable: true,
              value: parsedBody,
            };
          }
          return Reflect.getOwnPropertyDescriptor(currentTarget, prop);
        },
      }) as TContext & { parsedBody?: unknown };
    }

    return { parsedBody: undefined } as TContext & { parsedBody?: unknown };
  };

  // LOW-001: withAuth returns a handler with signature compatible with Route<TContext>.handler
  const withAuth = (
    action: DatafnAction,
    handler: (
      req: Request,
      ctx: TContext & { parsedBody?: unknown },
    ) => Promise<Response> | Response,
  ): ((req: Request, ctx: TContext) => Promise<Response>) => {
    return async (req: Request, ctx: TContext): Promise<Response> => {
      const enrichedCtx = createEnrichedContext(ctx);
      // REL-009: Reject new requests immediately when shutting down
      if (shuttingDown) {
        return new Response(
          JSON.stringify({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Server is shutting down" } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }

      // Track in-flight request for graceful shutdown drain
      inFlightCount++;
      try {
        // Rate limiting — applied BEFORE JSON parsing and authorization (RATE-001)
        if (rateLimitMiddleware) {
          const rateLimitResponse = await rateLimitMiddleware(action, enrichedCtx);
          if (rateLimitResponse) return rateLimitResponse;
        }

        // Enforce payload limits (LIMIT-001) — single inline check, no sentinel pattern
        if (limits.maxPayloadBytes) {
          const limitError = checkPayloadLimit(req, limits.maxPayloadBytes);
          if (limitError) return limitError;
        }

        // For POST/PUT/PATCH endpoints, parse JSON body FIRST before authorization
        // AUTH-001: Invalid JSON must return DFQL_INVALID, never FORBIDDEN
        let payload: unknown = null;

        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
          // If maxPayloadBytes is set but Content-Length was missing, enforce on actual body
          if (limits.maxPayloadBytes) {
            const bodyResult = await readBodyWithLimit(req, limits.maxPayloadBytes, logger);
            if (!bodyResult.ok) return bodyResult.response;
            // Parse JSON from the already-read body text
            try {
              payload = JSON.parse(bodyResult.body);
            } catch {
              return errorResponse({
                code: "DFQL_INVALID",
                message: "Invalid JSON",
                details: { path: "$" },
              }, 400);
            }
          } else {
            const parseResult = await parseJsonBody(req);
            if (!parseResult.ok) {
              return errorResponse(parseResult.error, 400);
            }
            payload = parseResult.data;
          }

        // Store parsed body in context so handler doesn't need to re-parse
          enrichedCtx.parsedBody = payload;
        }

        // Check authorization if configured - only called AFTER successful JSON parse
        if (config.authorize) {
          const authorized = await config.authorize(enrichedCtx, action, payload);
          if (!authorized) {
            return errorResponse(
              { code: "FORBIDDEN", message: "Authorization denied", details: { path: "$" } },
              403,
            );
          }
        }

        return await handler(req, enrichedCtx);
      } finally {
        inFlightCount--;
        // If shutdown is waiting and we were the last in-flight request, signal completion
        if (shuttingDown && inFlightCount === 0 && shutdownResolve) {
          const resolve = shutdownResolve;
          shutdownResolve = null;
          if (shutdownTimer) {
            clearTimeout(shutdownTimer);
            shutdownTimer = null;
          }
          resolve();
        }
      }
    };
  };

  // Define routes
  const routes: Route<TContext>[] = [
    {
      method: "GET",
      path: "/datafn/status",
      handler: withAuth("status", statusHandler),
    },
    {
      method: "POST",
      path: "/datafn/query",
      handler: withAuth("query", queryHandler),
    },
    {
      method: "POST",
      path: "/datafn/mutation",
      handler: withAuth("mutation", mutationHandler),
    },
    {
      method: "POST",
      path: "/datafn/transact",
      handler: withAuth("transact", transactHandler),
    },
    {
      method: "POST",
      path: "/datafn/clone",
      handler: withAuth("clone", cloneHandler),
    },
    {
      method: "POST",
      path: "/datafn/pull",
      handler: withAuth("pull", pullHandler),
    },
    {
      method: "POST",
      path: "/datafn/push",
      handler: withAuth("push", pushHandler),
    },
    {
      method: "POST",
      path: "/datafn/reconcile",
      handler: withAuth("reconcile", reconcileHandler),
    },
    {
      method: "POST",
      path: "/datafn/seed",
      handler: withAuth("seed", seedHandler),
    },
    {
      method: "POST",
      path: "/datafn/search",
      handler: withAuth("search", searchHandler),
    },
  ];

  // Register REST routes if config.rest is true
  if (config.rest) {
    // FIX-SRV-001: Direct internal execution helpers — no synthetic Request construction.
    // Handlers use ctx.parsedBody exclusively; the Request parameter is never read in this path.
    const internalMutate = async (
      m: unknown,
      ctx?: TContext & { parsedBody?: unknown },
    ): Promise<unknown> => {
      const res = await mutationHandler(undefined as any, {
        ...(ctx ?? {} as TContext),
        parsedBody: m,
      });
      const env = await res.json() as { ok: boolean; error?: unknown; result?: unknown };
      if (!env.ok) throw env.error;
      return env.result;
    };
    const internalQuery = async (
      q: unknown,
      ctx?: TContext & { parsedBody?: unknown },
    ): Promise<unknown> => {
      const res = await queryHandler(undefined as any, {
        ...(ctx ?? {} as TContext),
        parsedBody: q,
      });
      const env = await res.json() as { ok: boolean; error?: unknown; result?: unknown };
      if (!env.ok) throw env.error;
      return env.result;
    };

    const restRoutes = createRestRoutes(
      validatedSchema,
      internalMutate,
      internalQuery,
      logger,
    );

    // Map REST routes to router format and apply auth if needed
    // REST wrappers are just alternative interfaces to mutation/query, so we check "mutation"/"query" action?
    // Or introduce "rest" action.
    // For granularity, let's map: GET -> "query", POST/PATCH/DELETE -> "mutation".
    for (const route of restRoutes) {
      const action: DatafnAction = route.method === "GET" ? "query" : "mutation";
      routes.push({
        method: route.method,
        path: route.path,
        meta: route.meta,
        handler: withAuth(action, route.handler as any),
      });
    }
  }

  // Create router
  const router = createRouter<TContext>({
    routes,
    basePath: "/",
    context: config.context,
  });

  // REL-009: Graceful shutdown implementation
  const serverClose = async (): Promise<void> => {
    // Idempotent guard — safe to call from both direct close() and signal handlers
    if (shuttingDown) return;
    shuttingDown = true;
    process.off("SIGTERM", sigHandler);
    process.off("SIGINT", sigHandler);

    // Send WS close 1001 (Going Away) to all connected clients
    wsManager.close();

    // Drain in-flight requests (up to shutdownTimeoutMs)
    if (inFlightCount > 0) {
      const timeoutMs = config.shutdownTimeoutMs ?? 10_000;
      await new Promise<void>((resolve) => {
        shutdownResolve = resolve;
        shutdownTimer = setTimeout(() => {
          // Timeout reached — force-resolve even if requests are still in-flight
          if (shutdownResolve === resolve) {
            shutdownResolve = null;
            shutdownTimer = null;
            resolve();
          }
        }, timeoutMs);
        shutdownTimer.unref?.();
      });
    }

    // Dispose search provider
    if (config.searchProvider?.dispose) {
      try {
        await config.searchProvider.dispose();
      } catch (error) {
        logger.error("Search provider dispose failed", { error: String(error), operation: "search-dispose" });
      }
    }

    // Clean up timers
    if (pruneInterval) {
      clearInterval(pruneInterval);
      pruneInterval = null;
    }
    if (memoryRateLimiter) {
      memoryRateLimiter.destroy();
      memoryRateLimiter = null;
    }
  };

  // REL-009: Register signal handlers for automatic graceful shutdown
  // process.once ensures each fires at most once; shuttingDown guard prevents double-execution
  const sigHandler = () => serverClose().catch((e) => logger.error("Graceful shutdown error", { error: String(e), operation: "shutdown" }));
  process.on("SIGTERM", sigHandler);
  process.on("SIGINT", sigHandler);

  const serverSearch = async (
    params: import("./execution/search/cross-resource.js").CrossResourceSearchParams & {
      namespace?: string;
    },
    _ctx?: TContext,
  ): Promise<import("./execution/search/cross-resource.js").SearchResult> => {
    if (!db) {
      throw new Error("Database is not configured");
    }
    const query = typeof params.query === "string" ? params.query.trim() : "";
    if (query === "") {
      throw new DatafnExecutionError(
        "DFQL_INVALID",
        "Search query must not be empty",
        "query",
      );
    }
    if (query.length > 1000) {
      throw new DatafnExecutionError(
        "LIMIT_EXCEEDED",
        "Search query exceeds maximum length",
        "query",
      );
    }
    const limit = Math.min(params.limit ?? 50, 10_000);
    const limitPerResource = Math.min(params.limitPerResource ?? limit, 1_000);
    const namespace =
      params.namespace && params.namespace.trim() !== ""
        ? params.namespace
        : await extractNamespace(_ctx as TContext);

    const searchParams = {
      ...params,
      query,
      limit,
      limitPerResource,
    };

    if (config.searchProvider) {
      return executeCrossResourceSearch(
        searchParams,
        config.searchProvider,
        db,
        validatedSchema,
        namespace,
        logger,
      );
    }
    if (!hasDbNativeSearchSupport(db)) {
      throw new DatafnExecutionError(
        "DFQL_UNSUPPORTED",
        NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
      );
    }
    return executeDbNativeCrossResourceSearch(
      searchParams,
      db,
      validatedSchema,
      namespace,
      logger,
    );
  };

  return {
    router,
    search: serverSearch,
    websocketHandler: {
      addClient: (client, authContext) => wsManager.addClient(client, authContext),
      removeClient: (client) => wsManager.removeClient(client),
      handleMessage: (client, data) => wsManager.handleMessage(client, data),
      handlePong: (client) => wsManager.handlePong(client),
    },
    close: serverClose,
  };
}
