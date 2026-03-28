/**
 * Server-local types compatible with @datafn/core.
 * Defined here to avoid TS2709 ("Cannot use namespace as a type") when
 * emitting declarations that reference types from @datafn/core.
 * These shapes must stay compatible with the core package.
 */
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

export type DatafnFieldSchema = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "date" | "file" | "json";
  required?: boolean;
  nullable?: boolean;
  readonly?: boolean;
  default?: unknown;
  enum?: unknown[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean | string;
  encrypt?: boolean;
  volatile?: boolean;
};

export type DatafnResourceSchema = {
  name: string;
  version: number;
  idPrefix?: string;
  isRemoteOnly?: boolean;
  fields: DatafnFieldSchema[];
  indices?:
    | {
        base?: string[];
        search?: string[];
        vector?: string[];
      }
    | string[];
  permissions?: DatafnPermissionsPolicy;
  capabilities?: unknown;
};

export type DatafnRelationSchema = {
  from: string | string[];
  to: string | string[];
  type: "one-many" | "many-one" | "many-many" | "htree";
  relation?: string;
  inverse?: string;
  cache?: boolean;
  metadata?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "date" | "object" | "json";
  }>;
  fkField?: string;
  pathField?: string;
  joinTable?: string;
  joinColumns?: { from: string; to: string };
  /** Relation-level capabilities (e.g. "timestamps", "audit") for many-many join rows. */
  capabilities?: string[];
};

export type DatafnSchema = {
  version?: number;
  capabilities?: unknown;
  resources: DatafnResourceSchema[];
  relations?: DatafnRelationSchema[];
  namespaced?: boolean;
};

export type DatafnHookContext = {
  env: "client" | "server";
  schema: DatafnSchema;
  context?: unknown;
};

export interface HookError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BeforeHookResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HookError };

export type DatafnPlugin = {
  name: string;
  runsOn: Array<"client" | "server">;
  beforeQuery?: (ctx: DatafnHookContext, q: unknown) => Promise<unknown> | unknown;
  afterQuery?: (
    ctx: DatafnHookContext,
    q: unknown,
    result: unknown,
  ) => Promise<unknown> | unknown;
  beforeMutation?: (
    ctx: DatafnHookContext,
    m: unknown | unknown[],
  ) => Promise<unknown> | unknown;
  afterMutation?: (
    ctx: DatafnHookContext,
    m: unknown | unknown[],
    result: unknown,
  ) => Promise<void> | void;
  beforeSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push" | "cloneUp" | "reconcile",
    payload: unknown,
  ) => Promise<unknown> | unknown;
  afterSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push" | "cloneUp" | "reconcile",
    payload: unknown,
    result: unknown,
  ) => Promise<void> | void;
};

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

// Re-export for convenience — canonical definition lives in logger.ts
export type { DatafnLogger } from "./logger.js";
