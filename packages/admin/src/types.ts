/**
 * Administration scopes form one strict hierarchy. `organization` remains a
 * compatibility alias for the installation root used by early manifests.
 */
export type AdminScopeLevel = "installation" | "organization" | "workspace" | "project" | "environment";

export type AdminAvailability = "required-product" | "optional-product" | "nested" | "folded" | "unavailable";

export type AdminOperationClassification = "read" | "write" | "destructive";

export type AdminOperationSource = "console" | "rest" | "mcp" | "sdk" | (string & {});

export type AdminJsonPrimitive = string | number | boolean | null;

export type AdminJsonValue =
  | AdminJsonPrimitive
  | AdminJsonValue[]
  | { [key: string]: AdminJsonValue };

export interface AdminJsonSchema {
  title?: string;
  description?: string;
  type?: string | string[];
  enum?: readonly unknown[];
  const?: unknown;
  default?: unknown;
  examples?: readonly unknown[];
  properties?: Readonly<Record<string, AdminJsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean | AdminJsonSchema;
  items?: AdminJsonSchema;
  allOf?: readonly AdminJsonSchema[];
  anyOf?: readonly AdminJsonSchema[];
  oneOf?: readonly AdminJsonSchema[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export interface AdminObjectSchema extends AdminJsonSchema {
  type: "object";
  properties?: Readonly<Record<string, AdminJsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean | AdminJsonSchema;
}

export interface AdminScope {
  installationId?: string;
  /** @deprecated Use installationId. Accepted as the installation root for compatibility. */
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  environmentId?: string;
  namespace?: string;
  region?: string;
}

export interface AdminActor {
  id: string;
  type?: "user" | "service" | "agent" | (string & {});
  displayName?: string;
  email?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AdminOperationContext {
  scope: AdminScope;
  actor: AdminActor;
  requestId: string;
  correlationId?: string;
  source: AdminOperationSource;
  idempotencyKey?: string;
  confirmationToken?: string;
  signal?: AbortSignal;
  now?: Date;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AdminRouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}

export interface AdminSafetyDefinition {
  classification: AdminOperationClassification;
  idempotent?: boolean;
  requiresConfirmation?: boolean;
  /** Describes the assurance expected from a confirmation service. */
  confirmation?: {
    risk: "high" | "critical";
    method: "explicit" | "recent-auth" | "mfa" | "approval";
    reason: string;
    maxAgeSeconds?: number;
  };
  audit?: "required" | "optional" | "none";
}

export interface AdminPaginationDefinition {
  mode: "cursor";
  defaultLimit?: number;
  maxLimit?: number;
  cursorInput?: string;
  limitInput?: string;
  itemsOutput?: string;
  nextCursorOutput?: string;
}

export interface AdminMcpDefinition {
  enabled?: boolean;
  name?: string;
  description?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  annotations?: Readonly<Record<string, unknown>>;
}

export interface AdminRedactionDefinition {
  inputFields?: readonly string[];
  outputFields?: readonly string[];
  /**
   * Exact JSON paths for one-time outward secrets, rooted at the operation
   * output (for example `$.item.token` or `$.items[*].token`). Paths must resolve
   * through the declared output schema and are only valid for audited,
   * strongly-confirmed, non-idempotent operations.
   */
  allowOutputPaths?: readonly string[];
}

export type AdminOperationTargetDefinition =
  | {
      resource: string;
      idInput: string;
      collection?: false;
    }
  | {
      resource: string;
      collection: true;
      idInput?: never;
    };

export interface AdminOperationDefinition<
  TInput = unknown,
  TOutput = unknown,
> {
  id: string;
  title: string;
  description: string;
  inputSchema?: AdminJsonSchema;
  outputSchema?: AdminJsonSchema;
  route: AdminRouteDefinition | string;
  permission: string;
  /** Deepest ancestor required before this operation may be discovered or invoked. */
  minimumScope?: AdminScopeLevel;
  safety: AdminSafetyDefinition;
  pagination?: AdminPaginationDefinition;
  mcp?: AdminMcpDefinition | boolean;
  redaction?: AdminRedactionDefinition;
  /** Explicit object or collection binding; administration operations may not infer targets from verbs. */
  target: AdminOperationTargetDefinition;
  /** Phantom fields preserve handler inference without affecting manifests. */
  readonly __input?: TInput;
  readonly __output?: TOutput;
}

export interface AdminCapabilityOwner {
  moduleId: string;
  mountPath?: string;
}

export interface AdminDependencyDefinition {
  moduleId: string;
  required?: boolean;
  reason?: string;
}

export interface AdminNavigationDefinition {
  id: string;
  label: string;
  path: string;
  icon?: string;
  description?: string;
  order?: number;
  group?: string;
  parentId?: string;
  requiredPermission?: string;
}

export interface AdminHealthDefinition {
  operationId?: string;
  path?: string;
}

export type AdminPresentationFormat = "text" | "status" | "datetime" | "number" | "code";

export interface AdminResourceQueryFilterPresentation {
  /** Stable console query parameter and resource field name. */
  field: string;
  /** Dotted path in the list operation input (for example `filter.status`). */
  inputPath: string;
  label?: string;
  /** Optional finite choices rendered by generic consoles. */
  options?: readonly AdminJsonPrimitive[];
}

export interface AdminResourceParentPresentation {
  /** Resource whose detail page supplies the context for this collection. */
  resourceId: string;
  bindings: readonly {
    /** Dotted field read from the parent resource record. */
    sourceField: string;
    /** Query filter field declared by this resource. */
    queryField: string;
  }[];
}

export interface AdminResourcePresentation {
  /** Whether this resource can be browsed without parent context. Defaults to true. */
  standaloneList?: boolean;
  /** Read operation used for the generic collection page. Inference remains available when omitted. */
  listOperationId?: string;
  /** Read operation used for the generic detail page. Inference remains available when omitted. */
  detailOperationId?: string;
  titleField?: string;
  subtitleField?: string;
  statusField?: string;
  /** Schema-aware controls for translating console query parameters into list-operation input. */
  query?: {
    /** Dotted list-operation input path receiving the generic `q` control. */
    searchInputPath?: string;
    filters?: readonly AdminResourceQueryFilterPresentation[];
  };
  /** Parent detail context from which this resource can be reached. */
  parent?: AdminResourceParentPresentation;
  columns?: readonly {
    field: string;
    label: string;
    format?: AdminPresentationFormat;
  }[];
  /** Provider-side collection order; the console never reorders an already-paginated page. */
  defaultSort?: {
    field: string;
    direction: "asc" | "desc";
  };
}

export interface AdminResourceDefinition {
  id: string;
  label: string;
  description: string;
  icon?: string;
  risk: "standard" | "sensitive";
  /** Default minimum scope for operations targeting this resource. */
  minimumScope?: AdminScopeLevel;
  idField: string;
  displayFields?: readonly string[];
  searchableFields?: readonly string[];
  filterableFields?: readonly string[];
  sortableFields?: readonly string[];
  sensitiveFields?: readonly string[];
  /** Optional non-authoritative metadata for generic operator presentation. */
  presentation?: AdminResourcePresentation;
}

export interface AdminCapabilityManifest {
  schemaVersion: "1.0";
  id: string;
  displayName: string;
  version: string;
  description: string;
  category: string;
  availability: AdminAvailability;
  /** Required when the package has no truthful domain-backed operator service yet. */
  unavailableReason?: string;
  scopeLevels: readonly AdminScopeLevel[];
  owner?: AdminCapabilityOwner;
  dependencies?: readonly (AdminDependencyDefinition | string)[];
  navigation?: AdminNavigationDefinition | readonly AdminNavigationDefinition[];
  health?: AdminHealthDefinition;
  /** Function-owned resource presentation metadata. Operation schemas remain authoritative for transport. */
  resources?: readonly AdminResourceDefinition[];
  operations: readonly AdminOperationDefinition[];
}

export type AdminOperationInput<T extends AdminOperationDefinition> =
  T extends AdminOperationDefinition<infer TInput, unknown> ? TInput : never;

export type AdminOperationOutput<T extends AdminOperationDefinition> =
  T extends AdminOperationDefinition<unknown, infer TOutput> ? TOutput : never;

export interface AdminOperationResult<T = unknown> {
  /** Explicit success discriminator. Raw domain objects, including `{ data: ... }`, are not envelopes. */
  ok: true;
  data: T;
  page?: { nextCursor?: string | null; hasMore?: boolean };
  auditId?: string;
  warnings?: readonly string[];
  requestId?: string;
  correlationId?: string;
  meta?: Readonly<Record<string, unknown>>;
}

export interface AdminOperationError {
  ok: false;
  error: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    retryable?: boolean;
  };
  requestId?: string;
  correlationId?: string;
  auditId?: string;
  meta?: Readonly<Record<string, unknown>>;
}

export type AdminResult<T = unknown> = AdminOperationResult<T> | AdminOperationError;

export interface AdminOperationRequest<TInput = unknown> {
  input: TInput;
  context: AdminOperationContext;
}

export type AdminOperationHandler<TInput = unknown, TOutput = unknown> = (
  request: AdminOperationRequest<TInput>,
) => Promise<TOutput | AdminOperationResult<TOutput>> | TOutput | AdminOperationResult<TOutput>;

export type AdminOperationHandlers = Readonly<Record<string, AdminOperationHandler>>;

export interface AdminOperationCompensationRequest<TInput = unknown, TOutput = unknown>
  extends AdminOperationRequest<TInput> {
  result: AdminOperationResult<TOutput>;
  cause: unknown;
}

export type AdminOperationCompensator<TInput = unknown, TOutput = unknown> = (
  request: AdminOperationCompensationRequest<TInput, TOutput>,
) => Promise<void> | void;

export type AdminOperationCompensators = Readonly<Record<string, AdminOperationCompensator>>;

export interface AdminCapabilityAdapter<
  TManifest extends AdminCapabilityManifest = AdminCapabilityManifest,
> {
  readonly manifest: TManifest;
  readonly handlers: AdminOperationHandlers;
  /**
   * Reverses a completed domain side effect when its required terminal audit
   * cannot be persisted. A compensator must make a subsequent retry safe.
   */
  readonly compensators?: AdminOperationCompensators;
  invoke<T = unknown>(
    operationId: string,
    input: unknown,
    context: AdminOperationContext,
  ): Promise<AdminOperationResult<T>>;
  execute<T = unknown>(
    operationId: string,
    input: unknown,
    context: AdminOperationContext,
  ): Promise<AdminOperationResult<T>>;
}
