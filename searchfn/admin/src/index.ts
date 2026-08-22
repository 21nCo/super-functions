import {
  defineAdminCapability,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationDefinition,
} from "@superfunctions/admin";
export interface SearchFnAdminResourceDefinition {
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
}
export interface SearchFnAdminActionDefinition {
  id: string;
  resource: string;
  title: string;
  description: string;
  classification: "write" | "destructive";
  requiresConfirmation: boolean;
  idempotent: true;
  target: "resource" | "collection";
}
export const searchFnAdminResources = [
  {
    id: "adapters-backends",
    label: "Adapters Backends",
    description: "Inspect and operate adapters backends in SearchFn.",
    icon: "searchfn:adapters-backends",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "indexes-collections",
    label: "Indexes Collections",
    description: "Inspect and operate indexes collections in SearchFn.",
    icon: "searchfn:indexes-collections",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "schema",
    label: "Schema",
    description: "Inspect and operate schema in SearchFn.",
    icon: "searchfn:schema",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "documents",
    label: "Documents",
    description: "Inspect and operate documents in SearchFn.",
    icon: "searchfn:documents",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "ingestion",
    label: "Ingestion",
    description: "Inspect and operate ingestion in SearchFn.",
    icon: "searchfn:ingestion",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Inspect and operate diagnostics in SearchFn.",
    icon: "searchfn:diagnostics",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "synonyms",
    label: "Synonyms",
    description: "Inspect and operate synonyms in SearchFn.",
    icon: "searchfn:synonyms",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "ranking",
    label: "Ranking",
    description: "Inspect and operate ranking in SearchFn.",
    icon: "searchfn:ranking",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Inspect and operate analytics in SearchFn.",
    icon: "searchfn:analytics",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "keys",
    label: "Keys",
    description: "Inspect and operate keys in SearchFn.",
    icon: "searchfn:keys",
    risk: "sensitive",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [
      "secret",
      "token",
      "credential",
      "value",
      "password",
      "passwd",
      "apiKey",
      "privateKey",
      "authorization",
      "cookie",
      "otp",
      "otpCode",
      "recoveryCode",
      "recoveryCodes",
      "verificationCode",
      "sessionToken",
    ],
  },
  {
    id: "snapshots",
    label: "Snapshots",
    description: "Inspect and operate snapshots in SearchFn.",
    icon: "searchfn:snapshots",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "health",
    label: "Health",
    description: "Inspect and operate health in SearchFn.",
    icon: "searchfn:health",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
] as const satisfies readonly SearchFnAdminResourceDefinition[];
export const searchFnAdminActions = [
  {
    id: "index",
    resource: "documents",
    title: "Index",
    description: "Index one document by resource:id. Percent-encode resource names containing ':'; use resource:number:<id> for numeric IDs and resource:string:<percent-encoded-id> for arbitrary string IDs.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "batch-index",
    resource: "documents",
    title: "Batch Index",
    description: "Batch Index for documents.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "reindex",
    resource: "indexes-collections",
    title: "Reindex",
    description: "Reindex for indexes collections.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "remove-document",
    resource: "documents",
    title: "Remove Document",
    description: "Remove one document by resource:id. Percent-encode resource names containing ':'; use resource:number:<id> for numeric IDs and resource:string:<percent-encoded-id> for arbitrary string IDs.",
    classification: "destructive",
    requiresConfirmation: true,
    idempotent: true,
    target: "collection",
  },
  {
    id: "clear-index",
    resource: "indexes-collections",
    title: "Clear Index",
    description: "Clear Index for indexes collections.",
    classification: "destructive",
    requiresConfirmation: true,
    idempotent: true,
    target: "resource",
  },
  {
    id: "manage-schema",
    resource: "schema",
    title: "Manage Schema",
    description: "Manage Schema for schema.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "manage-synonym",
    resource: "synonyms",
    title: "Manage Synonym",
    description: "Manage Synonym for synonyms.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "manage-ranking",
    resource: "ranking",
    title: "Manage Ranking",
    description: "Manage Ranking for ranking.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "rotate-key",
    resource: "keys",
    title: "Rotate Key",
    description: "Rotate Key for keys.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "restore-snapshot",
    resource: "snapshots",
    title: "Restore Snapshot",
    description: "Restore Snapshot for snapshots.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
] as const satisfies readonly SearchFnAdminActionDefinition[];

export interface SearchFnAdminResourcePolicy {
  defaultScope: "active";
  permission: string;
  redaction: "none" | "sensitive-fields";
}

export interface SearchFnAdminOperationPolicy {
  permission: string;
  scope: {
    levels: readonly ["organization", "workspace", "project", "environment"];
    forwardsNamespace: true;
    forwardsRegion: true;
  };
  safety: {
    classification: "write" | "destructive";
    requiresConfirmation: boolean;
  };
  idempotency: {
    mode: "required";
    keyStrategy: "context.idempotencyKey";
  };
  audit: {
    mode: "required";
    action: string;
    targetResource: string;
    targetIdPath?: "$.id";
    collection?: true;
  };
  observation: {
    domain: "searchfn";
    requestIdPath: "context.requestId";
    correlationIdPath: "context.correlationId";
  };
}

export const searchFnAdminResourcePolicies = Object.freeze(
  Object.fromEntries(
    searchFnAdminResources.map((resource) => [
      resource.id,
      {
        defaultScope: "active",
        permission: "searchfn." + resource.id + ".read",
        redaction:
          resource.sensitiveFields.length > 0 ? "sensitive-fields" : "none",
      } satisfies SearchFnAdminResourcePolicy,
    ]),
  ),
) as Readonly<Record<string, SearchFnAdminResourcePolicy>>;

export const searchFnAdminOperationPolicies = Object.freeze(
  Object.fromEntries(
    searchFnAdminActions.map((action) => [
      "searchfn." + action.resource + "." + action.id,
      {
        permission: "searchfn." + action.resource + "." + action.id,
        scope: {
          levels: ["organization", "workspace", "project", "environment"],
          forwardsNamespace: true,
          forwardsRegion: true,
        },
        safety: {
          classification: action.classification,
          requiresConfirmation: action.requiresConfirmation,
        },
        idempotency: {
          mode: "required",
          keyStrategy: "context.idempotencyKey",
        },
        audit: {
          mode: "required",
          action: "searchfn." + action.id,
          targetResource: action.resource,
          ...(action.target === "resource"
            ? { targetIdPath: "$.id" as const }
            : { collection: true as const }),
        },
        observation: {
          domain: "searchfn",
          requestIdPath: "context.requestId",
          correlationIdPath: "context.correlationId",
        },
      } satisfies SearchFnAdminOperationPolicy,
    ]),
  ),
) as Readonly<Record<string, SearchFnAdminOperationPolicy>>;

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
    search: { type: "string", maxLength: 500 },
    filter: { type: "object", additionalProperties: true },
    sort: {
      type: "array",
      items: { type: "object", additionalProperties: true },
      maxItems: 10,
    },
  },
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
    id: { type: "string", minLength: 1 },
    payload: { type: "object", additionalProperties: true },
    reason: { type: "string", minLength: 1, maxLength: 2000 },
  },
  additionalProperties: false,
};
const actionOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    item: entitySchema,
    accepted: { type: "boolean" },
    operationReference: { type: "string" },
  },
  required: ["accepted"],
  additionalProperties: true,
};
const payloadSchema = (
  properties: NonNullable<AdminObjectSchema["properties"]>,
  required: string[] = [],
): AdminObjectSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const documentSchema: AdminObjectSchema = payloadSchema(
  {
    id: { type: ["string", "number"] },
    fields: { type: "object", additionalProperties: { type: "string" } },
  },
  ["id", "fields"],
);
const domainActionInputSchemas: Record<string, AdminObjectSchema> = {
  index: payloadSchema(
    {
      id: { type: "string", minLength: 3 },
      payload: payloadSchema(
        { fields: { type: "object", additionalProperties: { type: "string" } } },
        ["fields"],
      ),
    },
    ["id", "payload"],
  ),
  "batch-index": payloadSchema(
    {
      payload: payloadSchema(
        {
          resource: { type: "string", minLength: 1 },
          documents: { type: "array", items: documentSchema, minItems: 1, maxItems: 10_000 },
        },
        ["resource", "documents"],
      ),
    },
    ["payload"],
  ),
  "remove-document": { ...getInputSchema },
  "clear-index": { ...getInputSchema },
};
export const searchFnAdminSchemas = {
  entity: entitySchema,
  listInput: listInputSchema,
  listOutput: listOutputSchema,
  getInput: getInputSchema,
  getOutput: getOutputSchema,
  actionInput: actionInputSchema,
  actionOutput: actionOutputSchema,
} as const satisfies Record<string, AdminJsonSchema>;
function resourceOperations(
  resource: SearchFnAdminResourceDefinition,
): AdminOperationDefinition[] {
  const baseId = "searchfn." + resource.id,
    basePath = "/resources/" + resource.id;
  return [
    {
      id: baseId + ".list",
      title: "List " + resource.label,
      description:
        "List permitted " +
        resource.label.toLowerCase() +
        " in the active administration scope.",
      inputSchema: listInputSchema,
      outputSchema: listOutputSchema,
      route: { method: "GET", path: basePath },
      permission: "searchfn." + resource.id + ".read",
      minimumScope: "environment",
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
      permission: "searchfn." + resource.id + ".read",
      minimumScope: "environment",
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
  action: SearchFnAdminActionDefinition,
): AdminOperationDefinition {
  const sensitiveFields =
    searchFnAdminResources.find((resource) => resource.id === action.resource)
      ?.sensitiveFields ?? [];
  return {
    id: "searchfn." + action.resource + "." + action.id,
    title: action.title,
    description: action.description,
    inputSchema: domainActionInputSchemas[action.id] ?? (
      action.target === "resource"
        ? { ...actionInputSchema, required: ["id"] }
        : actionInputSchema
    ),
    outputSchema: actionOutputSchema,
    route: {
      method: "POST",
      path: "/resources/" + action.resource + "/actions/" + action.id,
    },
    permission: "searchfn." + action.resource + "." + action.id,
    minimumScope: "environment",
    safety: {
      classification: action.classification,
      idempotent: action.idempotent,
      requiresConfirmation: action.requiresConfirmation,
      audit: "required",
    },
    mcp: {
      readOnlyHint: false,
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
const domainReadResourceIds = new Set(["adapters-backends", "indexes-collections", "health"]);
const domainResourceIds = new Set([...domainReadResourceIds, "documents"]);
const domainActionIds = new Set(["index", "batch-index", "remove-document", "clear-index"]);
const domainResources = searchFnAdminResources.filter((resource) => domainResourceIds.has(resource.id));
const domainReadResources = domainResources.filter((resource) => domainReadResourceIds.has(resource.id));
const domainActions = searchFnAdminActions.filter((action) => domainActionIds.has(action.id));
const operations: AdminOperationDefinition[] = [
  ...domainReadResources.flatMap(resourceOperations),
  ...domainActions.map(actionOperation),
];
type FunctionAdminActionOperationId<TModule extends string, TAction> =
  TAction extends { resource: infer TResource extends string; id: infer TActionId extends string }
    ? `${TModule}.${TResource}.${TActionId}`
    : never;
type SearchFnDomainReadResourceId = "adapters-backends" | "indexes-collections" | "health";
type SearchFnDomainAction = Extract<
  (typeof searchFnAdminActions)[number],
  { id: "index" | "batch-index" | "remove-document" | "clear-index" }
>;
export type SearchFnAdminOperationId =
  | `searchfn.${SearchFnDomainReadResourceId}.list`
  | `searchfn.${SearchFnDomainReadResourceId}.get`
  | FunctionAdminActionOperationId<"searchfn", SearchFnDomainAction>;
export const searchFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "searchfn",
  displayName: "SearchFn",
  version: "1.0.0",
  description:
    "Function-owned SearchFn operator capabilities backed by an isolated search adapter.",
  category: "infrastructure",
  availability: "required-product",
  scopeLevels: ["organization", "workspace", "project", "environment"],
  health: { operationId: "searchfn.health.list" },
  dependencies: [],
  resources: domainResources,
  navigation: [
    {
      id: "searchfn",
      label: "SearchFn",
      path: "/modules/searchfn",
      icon: "searchfn",
      description: "Operate SearchFn in the active scope.",
      order: 100,
    },
  ],
  operations: operations as readonly (AdminOperationDefinition & { readonly id: SearchFnAdminOperationId })[],
});
export const adminCapability = searchFnAdminCapability;
export * from "./types.js";
export * from "./adapter.js";
export * from "./client.js";
export {
  createSearchFnDomainAdminService,
  type SearchFnDomainAdminServiceOptions,
} from "./domain-service.js";
