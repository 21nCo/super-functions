/**
 * DataFn Schema Types
 */

import type { DatafnError } from "./errors.js";
import type {
  CapabilityEntry,
  SchemaCapabilities,
  ResourceCapabilities,
  SimpleCapability,
} from "./capabilities.js";

export type DatafnSchema = {
  version?: number;
  capabilities?: SchemaCapabilities;
  defaultPermissions?: DatafnDefaultPermissionsPolicy;
  resources: readonly DatafnResourceSchema[];
  relations?: readonly DatafnRelationSchema[];
  relationIntegrity?: DatafnRelationIntegrityMode;
  /** Defaults to true. Set to false to disable row-level namespace isolation. */
  namespaced?: boolean;
};

export type DatafnDefaultPermissionsFieldMode = "allResourceFields";

export type DatafnDefaultPermissionsPolicy =
  | DatafnDefaultPermissionsFieldMode
  | {
      read?: DatafnDefaultPermissionsFieldMode | false;
      write?: DatafnDefaultPermissionsFieldMode | false;
      relationWrites?: "all" | false;
    };

/**
 * Permissions policy shape for server-side authorization enforcement.
 * All field arrays are optional; if omitted, no fields are accessible.
 */
export type DatafnPermissionsPolicy = {
  /**
   * Read policy: controls which fields can be selected and filtered.
   */
  read?: {
    fields: readonly string[];
  };
  /**
   * Write policy: controls which fields can be written via mutations.
   */
  write?: {
    fields: readonly string[];
  };
  /**
   * Optional owner field for owner-scoped resources.
   * When set, additional owner-based authorization checks can be performed.
   */
  ownerField?: string;
};

export type DatafnResourceSchema = {
  name: string;
  version: number;
  idPrefix?: string;
  isRemoteOnly?: boolean;
  /**
   * Resource capabilities.
   * For shareable resources, SPV2 extends shareable config with
   * visibility/membership/scope-related options while preserving legacy fields.
   */
  capabilities?: ResourceCapabilities;
  fields: readonly DatafnFieldSchema[];
  indices?:
    | {
        base?: readonly string[];
        search?: readonly string[];
        vector?: readonly string[];
      }
    | readonly string[];
  defaultPermissions?: false;
  permissions?: DatafnPermissionsPolicy;
};

export type DatafnFieldSchema = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "date" | "file" | "json";
  required: boolean;
  nullable?: boolean;
  readonly?: boolean;
  default?: unknown;
  enum?: readonly unknown[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean | string;
  encrypt?: boolean;
  volatile?: boolean;
};

export type RelationSimpleCapability = "timestamps" | "audit";

export type DatafnRelationIntegrityMode = "application" | "database";

export type DatafnRelationDeletePolicy =
  | "restrict"
  | "cascade"
  | "setNull"
  | "detach";

export type DatafnRelationDeletePolicies =
  | DatafnRelationDeletePolicy
  | {
      from?: DatafnRelationDeletePolicy;
      to?: DatafnRelationDeletePolicy;
    };

export type DatafnRelationSchema = {
  from: string | readonly string[];
  to: string | readonly string[];
  type: "one-many" | "many-one" | "many-many" | "htree";
  relation?: string;
  inverse?: string;
  cache?: boolean;
  metadata?: readonly {
    name: string;
    type: "string" | "number" | "boolean" | "date" | "object" | "json";
  }[];
  identityMetadata?: readonly string[];
  fkField?: string;
  /** @deprecated Use fkField. Retained for legacy schema compatibility. */
  foreignKey?: string;
  fkResourceField?: string;
  pathField?: string;
  joinTable?: string;
  joinColumns?: { from: string; to: string };
  integrity?: DatafnRelationIntegrityMode;
  onDelete?: DatafnRelationDeletePolicies;
  inheritsInactive?: boolean;
  capabilities?: readonly RelationSimpleCapability[];
};

/**
 * Type-safe schema definition helper.
 * Uses const generic to preserve literal field name types and constrain
 * index entries to only declared field names within each resource.
 */
type DatafnFieldInput = {
  readonly name: string;
  readonly type: DatafnFieldSchema["type"];
  readonly required: boolean;
  readonly [k: string]: unknown;
};

type DatafnIndicesInput<FieldName extends string> =
  | { readonly base?: readonly FieldName[]; readonly search?: readonly FieldName[]; readonly vector?: readonly FieldName[] }
  | readonly FieldName[];

type SchemaCapabilitiesInput = readonly CapabilityEntry[];
type ResourceCapabilitiesInput =
  | SchemaCapabilitiesInput
  | { readonly exclude: readonly SimpleCapability[] };

type DatafnResourceBase = {
  readonly name: string;
  readonly version: number;
  readonly idPrefix?: string;
  readonly isRemoteOnly?: boolean;
  readonly capabilities?: ResourceCapabilitiesInput;
  readonly fields: readonly DatafnFieldInput[];
  readonly indices?: DatafnIndicesInput<string>;
  readonly defaultPermissions?: false;
  readonly permissions?: DatafnPermissionsPolicy;
  readonly [k: string]: unknown;
};

type ValidateResources<R extends readonly DatafnResourceBase[]> = {
  readonly [K in keyof R]: R[K] extends { readonly fields: readonly { readonly name: infer N extends string }[] }
    ? Omit<R[K], "indices"> & { readonly indices?: DatafnIndicesInput<N> }
    : R[K];
};

declare const datafnSchemaLiteral: unique symbol;

export type DatafnDefinedSchema<T> = T & DatafnSchema & {
  readonly [datafnSchemaLiteral]?: T;
};

export type DatafnSchemaLiteral<S> =
  S extends { readonly [datafnSchemaLiteral]?: infer T } ? T : S;

export function defineSchema<
  const T extends {
    readonly capabilities?: SchemaCapabilitiesInput;
    readonly defaultPermissions?: DatafnDefaultPermissionsPolicy;
    readonly resources: readonly DatafnResourceBase[];
    readonly relations?: readonly DatafnRelationSchema[] | DatafnRelationSchema[];
    readonly relationIntegrity?: DatafnRelationIntegrityMode;
    readonly namespaced?: boolean;
  }
>(schema: T & { readonly resources: ValidateResources<T["resources"]> }): DatafnDefinedSchema<T> {
  return schema as unknown as DatafnDefinedSchema<T>;
}

/**
 * Event Types
 */

export interface DatafnEvent {
  type:
    | "mutation_applied"
    | "mutation_rejected"
    | "sync_started"
    | "sync_applied"
    | "sync_failed"
    | "sync_retry"
    | "connectivity_changed"
    | "ws_connected"
    | "ws_disconnected";
  resource?: string;
  ids?: string[];
  mutationId?: string;
  clientId?: string;
  timestampMs: number;
  context?: unknown;
  action?: string;
  fields?: string[];
  // MUT-002: When true, marks mutation as system-initiated
  system?: boolean;
  // TAB-001: When true, marks event as received from another tab (prevents re-broadcast)
  fromRemoteTab?: boolean;
}

export type DatafnEventFilter = Partial<{
  type: DatafnEvent["type"] | Array<DatafnEvent["type"]>;
  resource: string | string[];
  ids: string | string[];
  mutationId: string | string[];
  action: string | string[];
  fields: string | string[];
  contextKeys: string[];
  context: Record<string, unknown>;
}>;

/**
 * Signal Type
 */

export interface DatafnSignal<T> {
  get(): T;
  subscribe(handler: (value: T) => void): () => void;
  readonly loading: boolean;
  readonly error: DatafnError | null;
  readonly refreshing: boolean;
  readonly nextCursor: string | null | undefined;
  dispose(): void;
}

/**
 * Logger interface for structured, pluggable logging.
 */
export interface DatafnLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Limits configuration for server-side enforcement.
 */
export type DatafnLimitsConfig = {
  maxLimit?: number;
  maxTransactSteps?: number;
  maxPayloadBytes?: number;
  maxPullLimit?: number;
  maxBatchSize?: number;
  maxCloneRecords?: number;
  idempotencyTtlMs?: number;
  idempotencyMaxEntries?: number;
  maxSelectTokens?: number;
  maxFilterKeysPerLevel?: number;
  maxSortFields?: number;
  maxAggregations?: number;
  maxSearchQueryLength?: number;
  maxLikePatternLength?: number;
  maxIdLength?: number;
  maxFilterDepth?: number;
};

/**
 * WebSocket configuration for connection limits and heartbeat.
 */
export type DatafnWsConfig = {
  maxConnections?: number;
  maxConnectionsPerNamespace?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
};

/**
 * Plugin Types
 */

export type DatafnHookContext = {
  env: "client" | "server";
  schema: DatafnSchema;
  context?: unknown;
};

export interface DatafnPlugin {
  name: string;
  runsOn: Array<"client" | "server">;
  beforeQuery?: (
    ctx: DatafnHookContext,
    q: unknown,
  ) => Promise<unknown> | unknown;
  beforeSearch?: (
    ctx: DatafnHookContext,
    search: unknown,
  ) => Promise<unknown> | unknown;
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
  ) => Promise<unknown> | unknown;
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
  ) => Promise<unknown> | unknown;
}
