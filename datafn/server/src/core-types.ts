export type {
  DatafnFieldSchema,
  DatafnHookContext,
  DatafnLogger,
  DatafnPermissionsPolicy,
  DatafnPlugin,
  DatafnRelationSchema,
  DatafnResourceSchema,
  DatafnSchema,
} from "@datafn/core/types";
export type { CapabilityEntry } from "@datafn/core/capabilities";
export type { DatafnEnvelope, DatafnError, DatafnErrorCode } from "@datafn/core/errors";
export type { NormalizedRelation } from "@datafn/core/relations";
export type { SortTerm } from "@datafn/core/sort";

export interface HookError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BeforeHookResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HookError };

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
