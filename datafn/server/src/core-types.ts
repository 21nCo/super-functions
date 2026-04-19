/**
 * Server-local types compatible with @datafn/core.
 * Defined here to avoid TS2709 ("Cannot use namespace as a type") when
 * emitting declarations that reference types from @datafn/core.
 * These shapes must stay compatible with the core package.
 */
import type {
  CapabilityEntry,
  DatafnFieldSchema as CoreDatafnFieldSchema,
  DatafnHookContext as CoreDatafnHookContext,
  DatafnLogger as CoreDatafnLogger,
  DatafnPlugin as CoreDatafnPlugin,
  DatafnRelationSchema as CoreDatafnRelationSchema,
  DatafnResourceSchema as CoreDatafnResourceSchema,
  DatafnSchema as CoreDatafnSchema,
} from "@datafn/core";

export type DatafnErrorCode =
  | "SCHEMA_INVALID"
  | "INVALID_CAPABILITY"
  | "INVALID_CAPABILITY_CONFIG"
  | "CAPABILITY_FIELD_COLLISION"
  | "CAPABILITY_DEPENDENCY"
  | "DFQL_INVALID"
  | "DFQL_UNKNOWN_RESOURCE"
  | "DFQL_UNKNOWN_FIELD"
  | "DFQL_UNKNOWN_RELATION"
  | "DFQL_UNSUPPORTED"
  | "DFQL_ABORTED"
  | "LIMIT_EXCEEDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL"
  | "TRANSACTION_ROLLED_BACK"
  | "TRANSPORT_ERROR";

export type DatafnError = {
  code: DatafnErrorCode;
  message: string;
  details?: unknown;
};

export type DatafnEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: DatafnError };

export type DatafnPermissionsPolicy = {
  read?: { fields: string[] };
  write?: { fields: string[] };
  ownerField?: string;
};

export type DatafnFieldSchema = CoreDatafnFieldSchema;

export type DatafnResourceSchema = CoreDatafnResourceSchema;

export type DatafnRelationSchema = CoreDatafnRelationSchema;

export type DatafnSchema = CoreDatafnSchema & {
  version?: number;
};

export type DatafnHookContext = CoreDatafnHookContext;

export interface HookError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BeforeHookResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HookError };

export type DatafnPlugin = CoreDatafnPlugin;

export type SortTerm = {
  field: string;
  direction: "asc" | "desc";
};

export type NormalizedRelation = {
  toId: string;
  metadata: Record<string, unknown>;
};

export interface RetentionConfig {
  /** Number of days to retain change log entries. Default: unlimited. */
  changeLogDays?: number;
  /** Number of days to retain idempotency records. Default: unlimited. */
  idempotencyDays?: number;
  /** Whether to run pruning on server startup. Default: false. */
  pruneOnStartup?: boolean;
  /** Interval in milliseconds for periodic pruning. Minimum: 60000. Default: disabled. */
  pruneIntervalMs?: number;
}

export interface RateLimitConfig<TContext = any> {
  /** Enable rate limiting. Default: false. */
  enabled: boolean;
  /** Max requests per window per client. Default: 100. */
  maxRequests?: number;
  /** Window duration in seconds. Default: 60. */
  windowSeconds?: number;
  /** Per-endpoint overrides */
  endpoints?: Partial<Record<
    'query' | 'mutation' | 'transact' | 'push' | 'pull' | 'clone' | 'reconcile' | 'seed',
    { maxRequests: number; windowSeconds: number }
  >>;
  /** Key extractor for identifying clients. Default: uses authContext userId or "anonymous". */
  keyExtractor?: (ctx: TContext) => string | Promise<string>;
}

export interface ObservabilityConfig {
  /** Emit execution timing events. Default: false. */
  timing?: boolean;
  /** Custom timing event handler. Default: console.debug. */
  onTiming?: (event: import("./middleware/timing.js").ExecutionTimingEvent) => void;
}

export type DatafnLogger = CoreDatafnLogger;

export type { CapabilityEntry };
