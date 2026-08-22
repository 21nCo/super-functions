import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  createCapabilityAdminClient,
  defineAdminCapability,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminCapabilityAdapter,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
  type AdminResourcePresentation,
} from "@superfunctions/admin";
import type {
  DataFnActionOutput,
  DataFnAdminRecord,
  DataFnAdminService,
  DataFnCapabilityView,
  DataFnGetInput,
  DataFnIndexView,
  DataFnItemOutput,
  DataFnListInput,
  DataFnListRecordsInput,
  DataFnMutateInput,
  DataFnPageOutput,
  DataFnQueryInput,
  DataFnRelationView,
  DataFnResourceView,
  DataFnSchemaView,
  DataFnTransactInput,
} from "./types.js";

export * from "./types.js";

export interface DataFnAdminResourceDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  risk: "standard" | "sensitive";
  idField: string;
  displayFields: readonly string[];
  searchableFields: readonly string[];
  filterableFields: readonly string[];
  sortableFields: readonly string[];
  sensitiveFields: readonly string[];
  presentation?: AdminResourcePresentation;
}
export interface DataFnAdminActionDefinition {
  id: string;
  resource: string;
  title: string;
  description: string;
  classification: "read" | "write" | "destructive";
  requiresConfirmation: boolean;
  idempotent: true;
  target: "resource" | "collection";
}
export const dataFnAdminResources = [
  {
    id: "schemas",
    label: "Schemas",
    description: "Inspect and operate schemas in DataFn.",
    icon: "datafn:schemas",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "resources",
    label: "Resources",
    description: "Inspect and operate resources in DataFn.",
    icon: "datafn:resources",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "relations",
    label: "Relations",
    description: "Inspect and operate relations in DataFn.",
    icon: "datafn:relations",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "indices",
    label: "Indices",
    description: "Inspect and operate indices in DataFn.",
    icon: "datafn:indices",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    description: "Inspect and operate capabilities in DataFn.",
    icon: "datafn:capabilities",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "records",
    label: "Records",
    description: "Inspect and operate records in DataFn.",
    icon: "datafn:records",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["resource", "status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
    presentation: {
      standaloneList: false,
      listOperationId: "datafn.records.list",
      query: {
        filters: [{
          field: "resource",
          inputPath: "filter.resource",
          label: "Resource",
        }],
      },
      parent: {
        resourceId: "resources",
        bindings: [{ sourceField: "name", queryField: "resource" }],
      },
    },
  },
  {
    id: "queries",
    label: "Queries",
    description: "Inspect and operate queries in DataFn.",
    icon: "datafn:queries",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "sync-clients",
    label: "Sync Clients",
    description: "Inspect and operate sync clients in DataFn.",
    icon: "datafn:sync-clients",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "conflicts",
    label: "Conflicts",
    description: "Inspect and operate conflicts in DataFn.",
    icon: "datafn:conflicts",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "Inspect and operate permissions in DataFn.",
    icon: "datafn:permissions",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "public-links",
    label: "Public Links",
    description: "Inspect and operate public links in DataFn.",
    icon: "datafn:public-links",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "retention",
    label: "Retention",
    description: "Inspect and operate retention in DataFn.",
    icon: "datafn:retention",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "sequence-idempotency",
    label: "Sequence Idempotency",
    description: "Inspect and operate sequence idempotency in DataFn.",
    icon: "datafn:sequence-idempotency",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "regions",
    label: "Regions",
    description: "Inspect and operate regions in DataFn.",
    icon: "datafn:regions",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
] as const satisfies readonly DataFnAdminResourceDefinition[];
export const dataFnAdminActions = [
  {
    id: "query",
    resource: "queries",
    title: "Query",
    description: "Query for queries.",
    classification: "read",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "mutate",
    resource: "records",
    title: "Mutate",
    description: "Mutate for records.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "transact",
    resource: "records",
    title: "Transact",
    description: "Transact for records.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "seed",
    resource: "records",
    title: "Seed",
    description: "Seed for records.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "resolve-conflict",
    resource: "conflicts",
    title: "Resolve Conflict",
    description: "Resolve Conflict for conflicts.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "clone",
    resource: "sync-clients",
    title: "Clone",
    description: "Clone for sync clients.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "pull",
    resource: "sync-clients",
    title: "Pull",
    description: "Pull for sync clients.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "push",
    resource: "sync-clients",
    title: "Push",
    description: "Push for sync clients.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "reconcile",
    resource: "sync-clients",
    title: "Reconcile",
    description: "Reconcile for sync clients.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "grant-permission",
    resource: "permissions",
    title: "Grant Permission",
    description: "Grant Permission for permissions.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "revoke-permission",
    resource: "permissions",
    title: "Revoke Permission",
    description: "Revoke Permission for permissions.",
    classification: "destructive",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
  {
    id: "migrate",
    resource: "schemas",
    title: "Migrate",
    description: "Migrate for schemas.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "prune",
    resource: "retention",
    title: "Prune",
    description: "Prune for retention.",
    classification: "destructive",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
] as const satisfies readonly DataFnAdminActionDefinition[];

export interface DataFnAdminResourcePolicy {
  defaultScope: "active";
  permission: string;
  redaction: "none" | "sensitive-fields";
}

export interface DataFnAdminOperationPolicy {
  permission: string;
  scope: {
    levels: readonly ["organization", "workspace", "project", "environment"];
    forwardsNamespace: true;
    forwardsRegion: true;
  };
  safety: {
    classification: "read" | "write" | "destructive";
    requiresConfirmation: boolean;
  };
  idempotency:
    | { mode: "required"; keyStrategy: "context.idempotencyKey" }
    | { mode: "not-required" };
  audit: {
    mode: "required" | "optional";
    action: string;
    targetResource: string;
    targetIdPath?: "$.id";
    collection?: true;
  };
  observation: {
    domain: "datafn";
    requestIdPath: "context.requestId";
    correlationIdPath: "context.correlationId";
  };
}

export const dataFnAdminResourcePolicies = Object.freeze(
  Object.fromEntries(
    dataFnAdminResources.map((resource) => [
      resource.id,
      {
        defaultScope: "active",
        permission: "datafn." + resource.id + ".read",
        redaction:
          resource.sensitiveFields.length > 0 ? "sensitive-fields" : "none",
      } satisfies DataFnAdminResourcePolicy,
    ]),
  ),
) as Readonly<Record<string, DataFnAdminResourcePolicy>>;

export const dataFnAdminOperationPolicies = Object.freeze(
  Object.fromEntries(
    dataFnAdminActions.map((action) => [
      "datafn." + action.resource + "." + action.id,
      {
        permission: "datafn." + action.resource + "." + action.id,
        scope: {
          levels: ["organization", "workspace", "project", "environment"],
          forwardsNamespace: true,
          forwardsRegion: true,
        },
        safety: {
          classification: action.classification,
          requiresConfirmation: action.requiresConfirmation,
        },
        idempotency: action.classification === "read"
          ? { mode: "not-required" as const }
          : { mode: "required" as const, keyStrategy: "context.idempotencyKey" as const },
        audit: {
          mode: action.classification === "read" ? "optional" : "required",
          action: "datafn." + action.id,
          targetResource: action.resource,
          ...(action.target === "resource"
            ? { targetIdPath: "$.id" as const }
            : { collection: true as const }),
        },
        observation: {
          domain: "datafn",
          requestIdPath: "context.requestId",
          correlationIdPath: "context.correlationId",
        },
      } satisfies DataFnAdminOperationPolicy,
    ]),
  ),
) as Readonly<Record<string, DataFnAdminOperationPolicy>>;

const entitySchema: AdminObjectSchema = {
  type: "object",
  description:
    "A domain-owned administration resource. Sensitive fields are redacted by the domain service.",
  additionalProperties: true,
};
const listInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    cursor: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
  additionalProperties: false,
};
const recordListInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    cursor: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    filter: {
      type: "object",
      properties: { resource: { type: "string", minLength: 1 } },
      required: ["resource"],
      additionalProperties: true,
    },
  },
  required: ["filter"],
  additionalProperties: false,
};
const listOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: entitySchema },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["items"],
  additionalProperties: false,
};
const getInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};
const getOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { item: entitySchema },
  required: ["item"],
  additionalProperties: false,
};
const actionInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    payload: { type: "object", additionalProperties: true },
  },
  required: ["payload"],
  additionalProperties: false,
};
const mutateInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 3, pattern: "^[^:]+:.+$" },
    payload: { type: "object", additionalProperties: true },
  },
  required: ["id", "payload"],
  additionalProperties: false,
};
const actionOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    item: entitySchema,
    accepted: { type: "boolean" },
  },
  required: ["accepted", "item"],
  additionalProperties: false,
};
export const dataFnAdminSchemas = {
  entity: entitySchema,
  listInput: listInputSchema,
  recordListInput: recordListInputSchema,
  listOutput: listOutputSchema,
  getInput: getInputSchema,
  getOutput: getOutputSchema,
  actionInput: actionInputSchema,
  mutateInput: mutateInputSchema,
  actionOutput: actionOutputSchema,
} as const satisfies Record<string, AdminJsonSchema>;
function resourceOperations(
  resource: DataFnAdminResourceDefinition,
): AdminOperationDefinition[] {
  const baseId = "datafn." + resource.id;
  const basePath = "/resources/" + resource.id;
  return [
    {
      id: baseId + ".list",
      title: "List " + resource.label,
      description:
        "List permitted " +
        resource.label.toLowerCase() +
        " in the active administration scope.",
      inputSchema: resource.id === "records" ? recordListInputSchema : listInputSchema,
      outputSchema: listOutputSchema,
      route: { method: "GET", path: basePath },
      permission: "datafn." + resource.id + ".read",
      minimumScope: "project",
      safety: {
        classification: "read",
        idempotent: true,
        requiresConfirmation: false,
        audit: resource.risk === "sensitive" ? "required" : "optional",
      },
      pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 200 },
      mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      redaction: { outputFields: resource.sensitiveFields },
      target: { resource: resource.id, collection: true },
    },
    {
      id: baseId + ".get",
      title: "Get " + resource.label,
      description:
        "Get one permitted " + resource.label.toLowerCase() + " resource.",
      inputSchema: getInputSchema,
      outputSchema: getOutputSchema,
      route: { method: "GET", path: basePath + "/:id" },
      permission: "datafn." + resource.id + ".read",
      minimumScope: "project",
      safety: {
        classification: "read",
        idempotent: true,
        requiresConfirmation: false,
        audit: resource.risk === "sensitive" ? "required" : "optional",
      },
      mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      redaction: { outputFields: resource.sensitiveFields },
      target: { resource: resource.id, idInput: "id" },
    },
  ];
}
function actionOperation(
  action: DataFnAdminActionDefinition,
): AdminOperationDefinition {
  const sensitiveFields =
    dataFnAdminResources.find((resource) => resource.id === action.resource)
      ?.sensitiveFields ?? [];
  return {
    id: "datafn." + action.resource + "." + action.id,
    title: action.title,
    description: action.description,
    inputSchema: action.id === "mutate" ? mutateInputSchema : actionInputSchema,
    outputSchema: actionOutputSchema,
    route: {
      method: "POST",
      path: "/resources/" + action.resource + "/actions/" + action.id,
    },
    permission: "datafn." + action.resource + "." + action.id,
    minimumScope: "project",
    safety: {
      classification: action.classification,
      idempotent: action.idempotent,
      requiresConfirmation: action.requiresConfirmation,
      audit: action.classification === "read" ? "optional" : "required",
    },
    mcp: {
      readOnlyHint: action.classification === "read",
      destructiveHint: action.classification === "destructive",
      idempotentHint: action.idempotent,
    },
    redaction: { inputFields: sensitiveFields, outputFields: sensitiveFields },
    target:
      action.target === "resource"
        ? { resource: action.resource, idInput: "id" }
        : { resource: action.resource, collection: true },
  };
}
const domainResourceIds = new Set([
  "schemas",
  "resources",
  "relations",
  "indices",
  "capabilities",
  "records",
  "queries",
]);
const domainActionIds = new Set(["query", "mutate", "transact"]);
const domainResources = dataFnAdminResources.filter((resource) =>
  domainResourceIds.has(resource.id),
);
const domainActions = dataFnAdminActions.filter((action) =>
  domainActionIds.has(action.id),
);
const domainReadResources = domainResources.filter((resource) => resource.id !== "queries");
const operations: AdminOperationDefinition[] = [
  ...domainReadResources.flatMap(resourceOperations),
  ...domainActions.map(actionOperation),
];
type FunctionAdminActionOperationId<TModule extends string, TAction> =
  TAction extends { resource: infer TResource extends string; id: infer TActionId extends string }
    ? `${TModule}.${TResource}.${TActionId}`
    : never;
type DataFnDomainReadResourceId = "schemas" | "resources" | "relations" | "indices" | "capabilities" | "records";
type DataFnDomainAction = Extract<
  (typeof dataFnAdminActions)[number],
  { id: "query" | "mutate" | "transact" }
>;
export type DataFnAdminOperationId =
  | `datafn.${DataFnDomainReadResourceId}.list`
  | `datafn.${DataFnDomainReadResourceId}.get`
  | FunctionAdminActionOperationId<"datafn", DataFnDomainAction>;
export const dataFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "datafn",
  displayName: "DataFn",
  version: "1.0.0",
  description:
    "Function-owned DataFn operator capabilities backed by the configured executor and schema.",
  category: "infrastructure",
  availability: "required-product",
  scopeLevels: ["organization", "workspace", "project", "environment"],
  dependencies: [],
  resources: domainResources,
  navigation: [
    {
      id: "datafn",
      label: "DataFn",
      path: "/modules/datafn",
      icon: "datafn",
      description: "Operate DataFn in the active scope.",
      order: 100,
    },
  ],
  operations: operations as readonly (AdminOperationDefinition & { readonly id: DataFnAdminOperationId })[],
});

/** Named, operation-specific TypeScript client over the shared administration transport. */
export function createDataFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(dataFnAdminCapability, adminClient);
  const invoke = <TOutput>(
    operationId: DataFnAdminOperationId,
    input: unknown,
    options?: AdminClientRequestOptions,
  ) => adminClient.invokeOperation<TOutput>(operationId, input, options);
  return Object.assign(client, {
    schemas: {
      list: (input: DataFnListInput = {}, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnSchemaView>>("datafn.schemas.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnSchemaView>>("datafn.schemas.get", input, options),
    },
    resources: {
      list: (input: DataFnListInput = {}, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnResourceView>>("datafn.resources.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnResourceView>>("datafn.resources.get", input, options),
    },
    relations: {
      list: (input: DataFnListInput = {}, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnRelationView>>("datafn.relations.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnRelationView>>("datafn.relations.get", input, options),
    },
    indices: {
      list: (input: DataFnListInput = {}, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnIndexView>>("datafn.indices.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnIndexView>>("datafn.indices.get", input, options),
    },
    capabilities: {
      list: (input: DataFnListInput = {}, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnCapabilityView>>("datafn.capabilities.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnCapabilityView>>("datafn.capabilities.get", input, options),
    },
    records: {
      list: (input: DataFnListRecordsInput, options?: AdminClientRequestOptions) => invoke<DataFnPageOutput<DataFnAdminRecord>>("datafn.records.list", input, options),
      get: (input: DataFnGetInput, options?: AdminClientRequestOptions) => invoke<DataFnItemOutput<DataFnAdminRecord>>("datafn.records.get", input, options),
      mutate: (input: DataFnMutateInput, options?: AdminClientRequestOptions) => invoke<DataFnActionOutput>("datafn.records.mutate", input, options),
      transact: (input: DataFnTransactInput, options?: AdminClientRequestOptions) => invoke<DataFnActionOutput>("datafn.records.transact", input, options),
    },
    queries: {
      query: (input: DataFnQueryInput, options?: AdminClientRequestOptions) => invoke<DataFnActionOutput>("datafn.queries.query", input, options),
    },
  });
}

function bind<TInput, TOutput>(
  handler: (input: TInput, context: AdminOperationContext) => Promise<TOutput>,
) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

/** Exact handler coverage; adding a manifest operation requires an explicit service method. */
export function createDataFnAdminAdapter(
  service: DataFnAdminService,
): AdminCapabilityAdapter<typeof dataFnAdminCapability> {
  return createKernelAdminCapabilityAdapter(dataFnAdminCapability, {
    "datafn.schemas.list": bind(service.listSchemas),
    "datafn.schemas.get": bind(service.getSchema),
    "datafn.resources.list": bind(service.listResources),
    "datafn.resources.get": bind(service.getResource),
    "datafn.relations.list": bind(service.listRelations),
    "datafn.relations.get": bind(service.getRelation),
    "datafn.indices.list": bind(service.listIndices),
    "datafn.indices.get": bind(service.getIndex),
    "datafn.capabilities.list": bind(service.listCapabilities),
    "datafn.capabilities.get": bind(service.getCapability),
    "datafn.records.list": bind(service.listRecords),
    "datafn.records.get": bind(service.getRecord),
    "datafn.queries.query": bind(service.query),
    "datafn.records.mutate": bind(service.mutate),
    "datafn.records.transact": bind(service.transact),
  });
}
export const adminCapability = dataFnAdminCapability;
export const createAdminAdapter = createDataFnAdminAdapter;
export {
  createDataFnDomainAdminService,
  type DataFnDomainAdminServiceOptions,
} from "./domain-service.js";
