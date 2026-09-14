import type { Adapter, KVStoreAdapter, AtomicKVStoreAdapter } from "@superfunctions/db";
import type {
  KeyProvider,
  SecFnEnvironment,
  SecFnEncryptionConfig,
  SecFnLogger,
  SecFnRateLimitPolicyConfig,
  SecurityAuditEvent,
  SecurityEventType,
  SecFnSeverity,
} from "@secfn/core";

export interface SecFnRequestContext {
  actorId?: string;
  tenantId?: string;
  namespace?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type SecFnAdminAction =
  | "secrets:list"
  | "secrets:create"
  | "secrets:read"
  | "secrets:update"
  | "secrets:reveal"
  | "secrets:rotate"
  | "secrets:revoke"
  | "secrets:delete"
  | "secret-sets:list"
  | "secret-sets:read"
  | "secret-sets:reveal"
  | "secret-sets:create"
  | "secret-sets:update"
  | "secret-sets:delete"
  | "secret-set-members:list"
  | "secret-set-members:create"
  | "secret-set-members:update"
  | "secret-set-members:delete"
  | "service-tokens:create"
  | "service-tokens:revoke"
  | "audit-events:list"
  | "namespaces:list"
  | "namespaces:create"
  | "namespaces:update"
  | "namespaces:delete"
  | "environments:list"
  | "environments:create"
  | "environments:update"
  | "environments:delete"
  | "scan-runs:list";

export interface SecFnRateLimitConfig extends SecFnRateLimitPolicyConfig {
  /** Required for shared, multi-instance rate limiting. Must provide linearizable CAS. */
  atomicStore?: AtomicKVStoreAdapter;
  /** Non-atomic persistence requires explicit single-process mode. */
  persistence?: Adapter | KVStoreAdapter;
  singleProcess?: boolean;
}

export interface SecFnServerConfig<TContext extends SecFnRequestContext = SecFnRequestContext> {
  db: Adapter;
  basePath?: string;
  context?: TContext | ((request: Request) => TContext | Promise<TContext>);
  keyProvider?: KeyProvider;
  encryption?: SecFnEncryptionConfig;
  /** Required for all admin HTTP routes; omission denies access. Payload contains route params, query and a cloned Request for resource/scope policy. */
  authorize?: (
    ctx: TContext,
    action: SecFnAdminAction,
    payload: unknown,
  ) => boolean | Promise<boolean>;
  namespaceProvider?: (ctx: TContext) => string | undefined | Promise<string | undefined>;
  logger?: SecFnLogger;
  auditSink?: (event: SecurityAuditEvent) => void | Promise<void>;
  rateLimit?: SecFnRateLimitConfig;
}

export interface SecretScope {
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  environmentId?: string;
  environment?: SecFnEnvironment;
}

export interface AuditWriteInput {
  type: SecurityEventType;
  severity: SecFnSeverity;
  tenantId?: string;
  namespaceId?: string;
  namespace?: string;
  environmentId?: string;
  environment?: SecFnEnvironment;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}
