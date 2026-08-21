import {
  createAdminCapabilityAdapter,
  createCapabilityAdminClient,
  defineAdminCapability,
  type AdminCapabilityAdapter,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import type {
  ApiFnCompareSpecInput,
  ApiFnDiffView,
  ApiFnEnvironmentRecord,
  ApiFnOperatorService,
  ApiFnPageInput,
  ApiFnRegisterSpecInput,
  ApiFnSpecView,
  ApiFnUpsertEnvironmentInput,
} from "./operator-service.js";

export * from "./operator-service.js";

type IdInput = { id: string };
type Page<T> = { items: T[]; nextCursor: string | null };
type Item<T> = { item: T };
type Accepted = { accepted: true };
type AcceptedItem<T> = Accepted & { item: T };

const scopeSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    installationId: { type: "string" },
    workspaceId: { type: "string" },
    projectId: { type: "string" },
    environmentId: { type: ["string", "null"] },
  },
  required: ["installationId", "workspaceId", "projectId", "environmentId"],
  additionalProperties: false,
};
const pageInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    cursor: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
};
const idSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};
const documentSchema = {
  oneOf: [
    { type: "string", minLength: 1 },
    { type: "object", additionalProperties: true },
  ],
} as const;
const specViewSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    scope: scopeSchema,
    name: { type: "string" },
    version: { type: "string" },
    title: { type: "string" },
    endpointCount: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "scope", "name", "version", "title", "endpointCount", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const environmentSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    scope: scopeSchema,
    name: { type: "string" },
    baseUrl: { type: "string" },
    enabled: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "scope", "name", "baseUrl", "enabled", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const diffEntrySchema: AdminObjectSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["added", "removed", "modified"] },
    breaking: { type: "boolean" },
    path: { type: "string" },
    description: { type: "string" },
  },
  required: ["type", "breaking", "path", "description"],
  additionalProperties: false,
};
const diffSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    breaking: { type: "array", items: diffEntrySchema },
    nonBreaking: { type: "array", items: diffEntrySchema },
    hasBreakingChanges: { type: "boolean" },
    summary: {
      type: "object",
      properties: {
        added: { type: "integer", minimum: 0 },
        removed: { type: "integer", minimum: 0 },
        modified: { type: "integer", minimum: 0 },
        breaking: { type: "integer", minimum: 0 },
        nonBreaking: { type: "integer", minimum: 0 },
      },
      required: ["added", "removed", "modified", "breaking", "nonBreaking"],
      additionalProperties: false,
    },
  },
  required: ["breaking", "nonBreaking", "hasBreakingChanges", "summary"],
  additionalProperties: false,
};
const registerSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    document: documentSchema,
  },
  required: ["id", "name", "document"],
  additionalProperties: false,
};
const compareSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 }, candidate: documentSchema },
  required: ["id", "candidate"],
  additionalProperties: false,
};
const environmentInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    baseUrl: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
  },
  required: ["id", "name", "baseUrl"],
  additionalProperties: false,
};

function pageSchema(item: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: item },
      nextCursor: { type: ["string", "null"] },
    },
    required: ["items", "nextCursor"],
    additionalProperties: false,
  };
}
function itemSchema(item: AdminObjectSchema): AdminObjectSchema {
  return { type: "object", properties: { item }, required: ["item"], additionalProperties: false };
}
function acceptedSchema(item?: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: { accepted: { type: "boolean", const: true }, ...(item ? { item } : {}) },
    required: item ? ["accepted", "item"] : ["accepted"],
    additionalProperties: false,
  };
}
function operation<TInput, TOutput>() {
  return <const TId extends string>(
    value: AdminOperationDefinition<TInput, TOutput> & { readonly id: TId },
  ): AdminOperationDefinition<TInput, TOutput> & { readonly id: TId } => value;
}
const readSafety = { classification: "read", idempotent: true, requiresConfirmation: false, audit: "optional" } as const;
const writeSafety = { classification: "write", idempotent: true, requiresConfirmation: false, audit: "required" } as const;
const destructiveSafety = (reason: string) => ({
  classification: "destructive",
  idempotent: true,
  requiresConfirmation: true,
  confirmation: { risk: "high", method: "recent-auth", reason, maxAgeSeconds: 300 },
  audit: "required",
} as const);

const operations = [
  operation<ApiFnPageInput, Page<ApiFnSpecView>>()({
    id: "apifn.specs.list", title: "List API specs", description: "List scope-owned OpenAPI specifications.",
    inputSchema: pageInputSchema, outputSchema: pageSchema(specViewSchema), route: { method: "GET", path: "/resources/specs" },
    permission: "apifn.specs.read", minimumScope: "project", safety: readSafety,
    pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "specs", collection: true },
  }),
  operation<IdInput, Item<ApiFnSpecView>>()({
    id: "apifn.specs.get", title: "Get API spec", description: "Get validated spec metadata.",
    inputSchema: idSchema, outputSchema: itemSchema(specViewSchema), route: { method: "GET", path: "/resources/specs/:id" },
    permission: "apifn.specs.read", minimumScope: "project", safety: readSafety,
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "specs", idInput: "id" },
  }),
  operation<ApiFnRegisterSpecInput, AcceptedItem<ApiFnSpecView>>()({
    id: "apifn.specs.register", title: "Register API spec", description: "Parse, validate, and persist an OpenAPI specification.",
    inputSchema: registerSchema, outputSchema: acceptedSchema(specViewSchema), route: { method: "POST", path: "/resources/specs/actions/register" },
    permission: "apifn.specs.write", minimumScope: "project", safety: writeSafety,
    mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, redaction: { inputFields: ["document"] },
    target: { resource: "specs", idInput: "id" },
  }),
  operation<ApiFnCompareSpecInput, Item<ApiFnDiffView>>()({
    id: "apifn.specs.compare", title: "Compare API spec", description: "Diff a candidate against a persisted OpenAPI baseline.",
    inputSchema: compareSchema, outputSchema: itemSchema(diffSchema), route: { method: "POST", path: "/resources/specs/actions/compare" },
    permission: "apifn.specs.read", minimumScope: "project", safety: { ...readSafety, audit: "required" },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, redaction: { inputFields: ["candidate"] },
    target: { resource: "specs", idInput: "id" },
  }),
  operation<IdInput, Accepted>()({
    id: "apifn.specs.delete", title: "Delete API spec", description: "Delete a persisted API baseline.",
    inputSchema: idSchema, outputSchema: acceptedSchema(), route: { method: "POST", path: "/resources/specs/actions/delete" },
    permission: "apifn.specs.delete", minimumScope: "project", safety: destructiveSafety("Deleting an API baseline removes contract history."),
    mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }, target: { resource: "specs", idInput: "id" },
  }),
  operation<ApiFnPageInput, Page<ApiFnEnvironmentRecord>>()({
    id: "apifn.environments.list", title: "List environments", description: "List scope-owned API endpoints.",
    inputSchema: pageInputSchema, outputSchema: pageSchema(environmentSchema), route: { method: "GET", path: "/resources/environments" },
    permission: "apifn.environments.read", minimumScope: "project", safety: readSafety,
    pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 },
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "environments", collection: true },
  }),
  operation<IdInput, Item<ApiFnEnvironmentRecord>>()({
    id: "apifn.environments.get", title: "Get environment", description: "Get one scope-owned API endpoint.",
    inputSchema: idSchema, outputSchema: itemSchema(environmentSchema), route: { method: "GET", path: "/resources/environments/:id" },
    permission: "apifn.environments.read", minimumScope: "project", safety: readSafety,
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "environments", idInput: "id" },
  }),
  operation<ApiFnUpsertEnvironmentInput, AcceptedItem<ApiFnEnvironmentRecord>>()({
    id: "apifn.environments.upsert", title: "Upsert environment", description: "Create or update a non-secret API endpoint.",
    inputSchema: environmentInputSchema, outputSchema: acceptedSchema(environmentSchema), route: { method: "POST", path: "/resources/environments/actions/upsert" },
    permission: "apifn.environments.write", minimumScope: "project", safety: writeSafety,
    mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "environments", idInput: "id" },
  }),
  operation<IdInput, Accepted>()({
    id: "apifn.environments.delete", title: "Delete environment", description: "Delete a scope-owned API endpoint.",
    inputSchema: idSchema, outputSchema: acceptedSchema(), route: { method: "POST", path: "/resources/environments/actions/delete" },
    permission: "apifn.environments.delete", minimumScope: "project", safety: destructiveSafety("Deleting an API environment removes its operator target."),
    mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }, target: { resource: "environments", idInput: "id" },
  }),
] as const;

export const apiFnAdminResources = [
  { id: "specs", label: "API Specs", description: "Validated OpenAPI specifications owned by the active scope.", icon: "apifn:specs", risk: "standard", minimumScope: "project", idField: "id", displayFields: ["id", "name", "version", "endpointCount", "updatedAt"], searchableFields: ["id", "name", "title"], filterableFields: ["version"], sortableFields: ["name", "updatedAt"], sensitiveFields: [] },
  { id: "environments", label: "API Environments", description: "Non-secret HTTP endpoints used to exercise a scope-owned API.", icon: "apifn:environments", risk: "standard", minimumScope: "project", idField: "id", displayFields: ["id", "name", "baseUrl", "enabled"], searchableFields: ["id", "name", "baseUrl"], filterableFields: ["enabled"], sortableFields: ["name", "updatedAt"], sensitiveFields: [] },
] as const;

export type ApiFnAdminOperationId = (typeof operations)[number]["id"];
export const apiFnAdminActions = operations;
export const apiFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0", id: "apifn", displayName: "ApiFn", version: "1.1.0",
  description: "Validated OpenAPI registry and environment operator service.", category: "developer-tools", availability: "optional-product",
  scopeLevels: ["installation", "workspace", "project", "environment"], dependencies: [], resources: apiFnAdminResources,
  navigation: [{ id: "apifn", label: "ApiFn", path: "/modules/apifn", icon: "apifn", description: "Operate API contracts and targets.", order: 100 }],
  operations,
});

type ApiFnCapabilityClient = ReturnType<typeof createCapabilityAdminClient<typeof apiFnAdminCapability>>;
export interface ApiFnAdminClient extends ApiFnCapabilityClient {
  readonly specs: {
    list(input?: ApiFnPageInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.specs.list"]>;
    get(input: IdInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.specs.get"]>;
    register(input: ApiFnRegisterSpecInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.specs.register"]>;
    compare(input: ApiFnCompareSpecInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.specs.compare"]>;
    delete(input: IdInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.specs.delete"]>;
  };
  readonly environments: {
    list(input?: ApiFnPageInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.environments.list"]>;
    get(input: IdInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.environments.get"]>;
    upsert(input: ApiFnUpsertEnvironmentInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.environments.upsert"]>;
    delete(input: IdInput, options?: AdminClientRequestOptions): ReturnType<ApiFnCapabilityClient["operations"]["apifn.environments.delete"]>;
  };
}

export function createApiFnAdminClient(adminClient: AdminClient): ApiFnAdminClient {
  const client = createCapabilityAdminClient(apiFnAdminCapability, adminClient);
  return Object.assign(client, {
    specs: {
      list: (input: ApiFnPageInput = {}, options?: AdminClientRequestOptions) => client.invoke("apifn.specs.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("apifn.specs.get", input, options),
      register: (input: ApiFnRegisterSpecInput, options?: AdminClientRequestOptions) => client.invoke("apifn.specs.register", input, options),
      compare: (input: ApiFnCompareSpecInput, options?: AdminClientRequestOptions) => client.invoke("apifn.specs.compare", input, options),
      delete: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("apifn.specs.delete", input, options),
    },
    environments: {
      list: (input: ApiFnPageInput = {}, options?: AdminClientRequestOptions) => client.invoke("apifn.environments.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("apifn.environments.get", input, options),
      upsert: (input: ApiFnUpsertEnvironmentInput, options?: AdminClientRequestOptions) => client.invoke("apifn.environments.upsert", input, options),
      delete: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("apifn.environments.delete", input, options),
    },
  });
}

type ServiceMethod<TInput> = (input: TInput, context: AdminOperationContext) => Promise<unknown>;
function bind<TInput>(handler: ServiceMethod<TInput>) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}
export function createApiFnAdminAdapter(service: ApiFnOperatorService): AdminCapabilityAdapter<typeof apiFnAdminCapability> {
  return createAdminCapabilityAdapter(apiFnAdminCapability, {
    "apifn.specs.list": bind(service.listSpecs),
    "apifn.specs.get": bind(service.getSpec),
    "apifn.specs.register": bind(service.registerSpec),
    "apifn.specs.compare": bind(service.compareSpec),
    "apifn.specs.delete": bind(service.deleteSpec),
    "apifn.environments.list": bind(service.listEnvironments),
    "apifn.environments.get": bind(service.getEnvironment),
    "apifn.environments.upsert": bind(service.upsertEnvironment),
    "apifn.environments.delete": bind(service.deleteEnvironment),
  });
}

export const adminCapability = apiFnAdminCapability;
export const createAdminAdapter = createApiFnAdminAdapter;
