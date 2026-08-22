import {
  createAdminCapabilityAdapter as createKernelAdapter,
  createCapabilityAdminClient,
  decodeAdminCursor,
  defineAdminCapability,
  encodeAdminCursor,
  AdminError,
  type AdminCapabilityAdapter,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
  type AdminOperationResult,
} from "@superfunctions/admin";
import {
  HostFnOperatorService,
  type HostFnDeployment,
  type HostFnDomain,
  type HostFnScope,
  type HostFnTarget,
  type HostFnVariable,
} from "hostfn/operator";

export interface PageInput {
  cursor?: string;
  limit?: number;
}
export interface IdInput {
  id: string;
}
export interface TargetListInput extends PageInput {
  status?: string;
}
export interface ChildListInput extends PageInput {
  targetId?: string;
}
export interface DeployInput {
  targetId: string;
  revision: string;
}
export interface AttachDomainInput {
  targetId: string;
  hostname: string;
  tls?: boolean;
}
export interface SetVariableInput {
  targetId: string;
  key: string;
  value: string;
}
export interface PageOutput<T = unknown> {
  items: T[];
  nextCursor: string | null;
}
export interface ItemOutput<T = unknown> {
  item: T;
}

export interface HostFnAdminOperationInputMap {
  "hostfn.targets.list": TargetListInput;
  "hostfn.targets.get": IdInput;
  "hostfn.targets.restart": IdInput;
  "hostfn.deployments.list": ChildListInput;
  "hostfn.deployments.get": IdInput;
  "hostfn.deployments.deploy": DeployInput;
  "hostfn.deployments.cancel": IdInput;
  "hostfn.deployments.rollback": IdInput;
  "hostfn.domains.list": ChildListInput;
  "hostfn.domains.attach": AttachDomainInput;
  "hostfn.domains.detach": IdInput;
  "hostfn.variables.list": ChildListInput;
  "hostfn.variables.set": SetVariableInput;
  "hostfn.variables.delete": IdInput;
}
export type HostFnAdminOperationId = keyof HostFnAdminOperationInputMap;
export interface HostFnAdminOperationOutputMap {
  "hostfn.targets.list": PageOutput<HostFnTarget>;
  "hostfn.targets.get": ItemOutput<HostFnTarget>;
  "hostfn.targets.restart": ItemOutput<HostFnTarget>;
  "hostfn.deployments.list": PageOutput<HostFnDeployment>;
  "hostfn.deployments.get": ItemOutput<HostFnDeployment>;
  "hostfn.deployments.deploy": ItemOutput<HostFnDeployment>;
  "hostfn.deployments.cancel": ItemOutput<HostFnDeployment>;
  "hostfn.deployments.rollback": ItemOutput<HostFnDeployment>;
  "hostfn.domains.list": PageOutput<HostFnDomain>;
  "hostfn.domains.attach": ItemOutput<HostFnDomain>;
  "hostfn.domains.detach": ItemOutput<HostFnDomain>;
  "hostfn.variables.list": PageOutput<HostFnVariable>;
  "hostfn.variables.set": ItemOutput<HostFnVariable>;
  "hostfn.variables.delete": ItemOutput<HostFnVariable>;
}

const scopeSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    installationId: { type: "string" },
    workspaceId: { type: "string" },
    projectId: { type: "string" },
    environmentId: { type: "string" },
  },
  required: ["installationId", "workspaceId", "projectId", "environmentId"],
  additionalProperties: false,
};
const records = {
  targets: {
    type: "object",
    properties: {
      id: { type: "string" },
      scope: scopeSchema,
      name: { type: "string" },
      server: { type: "string" },
      runtime: { type: "string" },
      status: { type: "string" },
      updatedAt: { type: "string" },
    },
    required: [
      "id",
      "scope",
      "name",
      "server",
      "runtime",
      "status",
      "updatedAt",
    ],
    additionalProperties: false,
  },
  deployments: {
    type: "object",
    properties: {
      id: { type: "string" },
      scope: scopeSchema,
      targetId: { type: "string" },
      revision: { type: "string" },
      status: { type: "string" },
      createdAt: { type: "string" },
      updatedAt: { type: "string" },
    },
    required: [
      "id",
      "scope",
      "targetId",
      "revision",
      "status",
      "createdAt",
      "updatedAt",
    ],
    additionalProperties: false,
  },
  domains: {
    type: "object",
    properties: {
      id: { type: "string" },
      scope: scopeSchema,
      targetId: { type: "string" },
      hostname: { type: "string" },
      tls: { type: "boolean" },
      status: { type: "string" },
      updatedAt: { type: "string" },
    },
    required: [
      "id",
      "scope",
      "targetId",
      "hostname",
      "tls",
      "status",
      "updatedAt",
    ],
    additionalProperties: false,
  },
  variables: {
    type: "object",
    properties: {
      id: { type: "string" },
      scope: scopeSchema,
      targetId: { type: "string" },
      key: { type: "string" },
      updatedAt: { type: "string" },
    },
    required: ["id", "scope", "targetId", "key", "updatedAt"],
    additionalProperties: false,
  },
} as const satisfies Record<string, AdminObjectSchema>;
const pageOutput = (record: AdminObjectSchema): AdminObjectSchema => ({
  type: "object",
  properties: {
    items: { type: "array", items: record },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["items", "nextCursor"],
  additionalProperties: false,
});
const itemOutput = (record: AdminObjectSchema): AdminObjectSchema => ({
  type: "object",
  properties: { item: record },
  required: ["item"],
  additionalProperties: false,
});
const page = {
  cursor: { type: "string" },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
} as const;
const idSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};
const targetListSchema: AdminObjectSchema = {
  type: "object",
  properties: { ...page, status: { type: "string" } },
  additionalProperties: false,
};
const childListSchema: AdminObjectSchema = {
  type: "object",
  properties: { ...page, targetId: { type: "string" } },
  additionalProperties: false,
};
const deploySchema: AdminObjectSchema = {
  type: "object",
  properties: {
    targetId: { type: "string", minLength: 1 },
    revision: { type: "string", minLength: 1 },
  },
  required: ["targetId", "revision"],
  additionalProperties: false,
};
const domainSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    targetId: { type: "string", minLength: 1 },
    hostname: { type: "string", minLength: 1 },
    tls: { type: "boolean", default: true },
  },
  required: ["targetId", "hostname"],
  additionalProperties: false,
};
const variableSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    targetId: { type: "string", minLength: 1 },
    key: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$" },
    value: { type: "string" },
  },
  required: ["targetId", "key", "value"],
  additionalProperties: false,
};

export const hostFnAdminResources = [
  {
    id: "targets",
    label: "Targets",
    description: "Configured HostFn runtime targets.",
    icon: "hostfn:targets",
    risk: "standard",
    minimumScope: "environment",
    idField: "id",
    displayFields: ["id", "name", "runtime", "status", "updatedAt"],
    searchableFields: ["id", "name", "server"],
    filterableFields: ["status", "runtime"],
    sortableFields: ["updatedAt", "name"],
    sensitiveFields: ["server"],
  },
  {
    id: "deployments",
    label: "Deployments",
    description: "HostFn deployment history and state.",
    icon: "hostfn:deployments",
    risk: "standard",
    minimumScope: "environment",
    idField: "id",
    displayFields: ["id", "targetId", "revision", "status", "updatedAt"],
    searchableFields: ["id", "revision"],
    filterableFields: ["targetId", "status"],
    sortableFields: ["updatedAt", "createdAt"],
    sensitiveFields: [],
  },
  {
    id: "domains",
    label: "Domains",
    description: "Domains attached to HostFn targets.",
    icon: "hostfn:domains",
    risk: "standard",
    minimumScope: "environment",
    idField: "id",
    displayFields: ["id", "hostname", "tls", "status", "updatedAt"],
    searchableFields: ["id", "hostname"],
    filterableFields: ["targetId", "status"],
    sortableFields: ["updatedAt", "hostname"],
    sensitiveFields: [],
  },
  {
    id: "variables",
    label: "Variables",
    description: "Environment-variable keys. Values are never readable.",
    icon: "hostfn:variables",
    risk: "sensitive",
    minimumScope: "environment",
    idField: "id",
    displayFields: ["id", "targetId", "key", "updatedAt"],
    searchableFields: ["id", "key"],
    filterableFields: ["targetId"],
    sortableFields: ["updatedAt", "key"],
    sensitiveFields: ["value"],
  },
] as const;

function read(
  id: HostFnAdminOperationId,
  resource: keyof typeof records,
  inputSchema: AdminObjectSchema,
  collection: boolean,
): AdminOperationDefinition {
  const outputSchema = collection
    ? pageOutput(records[resource])
    : itemOutput(records[resource]);
  return {
    id,
    title: id.split(".").at(-1)!,
    description: `Read HostFn ${resource} in the active environment.`,
    inputSchema,
    outputSchema,
    route: {
      method: "GET",
      path: `/resources/${resource}${collection ? "" : "/:id"}`,
    },
    permission: `hostfn.${resource}.read`,
    minimumScope: "environment",
    safety: {
      classification: "read",
      idempotent: true,
      requiresConfirmation: false,
      audit:
        resource === "variables" || resource === "targets"
          ? "required"
          : "optional",
    },
    pagination: collection
      ? { mode: "cursor", defaultLimit: 50, maxLimit: 100 }
      : undefined,
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    redaction:
      resource === "variables"
        ? { outputFields: ["value"] }
        : resource === "targets"
          ? { outputFields: ["server"] }
          : undefined,
    target: collection
      ? { resource, collection: true }
      : { resource, idInput: "id" },
  };
}
function write(
  id: HostFnAdminOperationId,
  resource: keyof typeof records,
  inputSchema: AdminObjectSchema,
  destructive = false,
  secret = false,
  externalEffect = false,
): AdminOperationDefinition {
  return {
    id,
    title: id.split(".").at(-1)!,
    description: `Operate HostFn ${resource} in the active environment.`,
    inputSchema,
    outputSchema: itemOutput(records[resource]),
    route: {
      method: "POST",
      path: `/resources/${resource}/actions/${id.split(".").at(-1)}`,
    },
    permission: id,
    minimumScope: "environment",
    safety: {
      classification: destructive ? "destructive" : "write",
      idempotent: true,
      requiresConfirmation: destructive || secret || externalEffect,
      confirmation:
        destructive || secret || externalEffect
          ? {
              risk: destructive ? "critical" : "high",
              method: destructive ? "mfa" : secret ? "recent-auth" : "explicit",
              reason: externalEffect
                ? `Authorize externally visible ${id}.`
                : `Authorize ${id}.`,
              maxAgeSeconds: 300,
            }
          : undefined,
      audit: "required",
    },
    mcp: {
      readOnlyHint: false,
      destructiveHint: destructive,
      idempotentHint: true,
    },
    redaction: secret
      ? { inputFields: ["value"] }
      : resource === "targets"
        ? { outputFields: ["server"] }
        : undefined,
    target:
      id.endsWith(".deploy") || id.endsWith(".attach") || id.endsWith(".set")
        ? { resource, collection: true }
        : { resource, idInput: "id" },
  };
}
const operations = [
  read("hostfn.targets.list", "targets", targetListSchema, true),
  read("hostfn.targets.get", "targets", idSchema, false),
  write("hostfn.targets.restart", "targets", idSchema, true),
  read("hostfn.deployments.list", "deployments", childListSchema, true),
  read("hostfn.deployments.get", "deployments", idSchema, false),
  write(
    "hostfn.deployments.deploy",
    "deployments",
    deploySchema,
    false,
    false,
    true,
  ),
  write("hostfn.deployments.cancel", "deployments", idSchema, true),
  write("hostfn.deployments.rollback", "deployments", idSchema, true),
  read("hostfn.domains.list", "domains", childListSchema, true),
  write("hostfn.domains.attach", "domains", domainSchema, false, false, true),
  write("hostfn.domains.detach", "domains", idSchema, true),
  read("hostfn.variables.list", "variables", childListSchema, true),
  write("hostfn.variables.set", "variables", variableSchema, false, true),
  write("hostfn.variables.delete", "variables", idSchema, true),
] as const;

export const hostFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "hostfn",
  displayName: "HostFn",
  version: "1.1.0",
  description:
    "Self-hosted deployment target, release, domain, and environment administration.",
  category: "infrastructure",
  availability: "required-product",
  scopeLevels: ["installation", "workspace", "project", "environment"],
  dependencies: [],
  resources: hostFnAdminResources,
  navigation: [
    {
      id: "hostfn",
      label: "HostFn",
      path: "/modules/hostfn",
      icon: "hostfn",
      description: "Operate HostFn deployments.",
      order: 120,
    },
  ],
  operations,
});

type CoreClient = ReturnType<
  typeof createCapabilityAdminClient<typeof hostFnAdminCapability>
>;
export interface HostFnAdminClient extends CoreClient {
  targets: {
    list(
      input?: TargetListInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<HostFnAdminOperationOutputMap["hostfn.targets.list"]>
    >;
    get(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<HostFnAdminOperationOutputMap["hostfn.targets.get"]>
    >;
    restart(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.targets.restart"]
      >
    >;
  };
  deployments: {
    list(
      input?: ChildListInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.deployments.list"]
      >
    >;
    get(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.deployments.get"]
      >
    >;
    deploy(
      input: DeployInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.deployments.deploy"]
      >
    >;
    cancel(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.deployments.cancel"]
      >
    >;
    rollback(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.deployments.rollback"]
      >
    >;
  };
  domains: {
    list(
      input?: ChildListInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<HostFnAdminOperationOutputMap["hostfn.domains.list"]>
    >;
    attach(
      input: AttachDomainInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.domains.attach"]
      >
    >;
    detach(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.domains.detach"]
      >
    >;
  };
  variables: {
    list(
      input?: ChildListInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.variables.list"]
      >
    >;
    set(
      input: SetVariableInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.variables.set"]
      >
    >;
    delete(
      input: IdInput,
      options?: AdminClientRequestOptions,
    ): Promise<
      AdminOperationResult<
        HostFnAdminOperationOutputMap["hostfn.variables.delete"]
      >
    >;
  };
}
export function createHostFnAdminClient(
  adminClient: AdminClient,
): HostFnAdminClient {
  const client = createCapabilityAdminClient(
    hostFnAdminCapability,
    adminClient,
  );
  const invoke = (
    id: HostFnAdminOperationId,
    input: object,
    options?: AdminClientRequestOptions,
  ) => client.invoke(id, input, options);
  return Object.assign(client, {
    targets: {
      list: (i: TargetListInput = {}, o?: AdminClientRequestOptions) =>
        invoke("hostfn.targets.list", i, o),
      get: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.targets.get", i, o),
      restart: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.targets.restart", i, o),
    },
    deployments: {
      list: (i: ChildListInput = {}, o?: AdminClientRequestOptions) =>
        invoke("hostfn.deployments.list", i, o),
      get: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.deployments.get", i, o),
      deploy: (i: DeployInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.deployments.deploy", i, o),
      cancel: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.deployments.cancel", i, o),
      rollback: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.deployments.rollback", i, o),
    },
    domains: {
      list: (i: ChildListInput = {}, o?: AdminClientRequestOptions) =>
        invoke("hostfn.domains.list", i, o),
      attach: (i: AttachDomainInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.domains.attach", i, o),
      detach: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.domains.detach", i, o),
    },
    variables: {
      list: (i: ChildListInput = {}, o?: AdminClientRequestOptions) =>
        invoke("hostfn.variables.list", i, o),
      set: (i: SetVariableInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.variables.set", i, o),
      delete: (i: IdInput, o?: AdminClientRequestOptions) =>
        invoke("hostfn.variables.delete", i, o),
    },
  }) as unknown as HostFnAdminClient;
}

function scope(context: AdminOperationContext): HostFnScope {
  const installationId =
    context.scope.installationId ?? context.scope.organizationId;
  const { workspaceId, projectId, environmentId } = context.scope;
  if (!installationId || !workspaceId || !projectId || !environmentId)
    throw new AdminError(
      "invalid_argument",
      "HostFn requires installation, workspace, project, and environment scope.",
    );
  return { installationId, workspaceId, projectId, environmentId };
}
export interface HostFnAdminService {
  listTargets(
    input: TargetListInput,
    context: AdminOperationContext,
  ): Promise<PageOutput>;
  getTarget(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  restartTarget(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  listDeployments(
    input: ChildListInput,
    context: AdminOperationContext,
  ): Promise<PageOutput>;
  getDeployment(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  deploy(
    input: DeployInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  cancelDeployment(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  rollbackDeployment(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  listDomains(
    input: ChildListInput,
    context: AdminOperationContext,
  ): Promise<PageOutput>;
  attachDomain(
    input: AttachDomainInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  detachDomain(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  listVariables(
    input: ChildListInput,
    context: AdminOperationContext,
  ): Promise<PageOutput>;
  setVariable(
    input: SetVariableInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
  deleteVariable(
    input: IdInput,
    context: AdminOperationContext,
  ): Promise<ItemOutput>;
}
function pageResult(
  items: unknown[],
  input: PageInput,
  context: AdminOperationContext,
  identity: string,
): PageOutput {
  const cursorScope = scope(context);
  let offset = 0;
  if (input.cursor) {
    try {
      const decoded = decodeAdminCursor<{ identity?: unknown; offset?: unknown }>(input.cursor, cursorScope);
      if (
        decoded.identity !== identity ||
        typeof decoded.offset !== "number" ||
        !Number.isSafeInteger(decoded.offset) ||
        decoded.offset < 0
      )
        throw new Error();
      offset = decoded.offset;
    } catch {
      throw new AdminError(
        "invalid_argument",
        "HostFn cursor does not belong to the active scope.",
      );
    }
  }
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    nextCursor:
      nextOffset < items.length
        ? encodeAdminCursor(cursorScope, { identity, offset: nextOffset })
        : null,
  };
}

function pageIdentity(operationId: string, filter?: string): string {
  return JSON.stringify([operationId, filter ?? null]);
}
export function createHostFnOperatorAdminService(
  operator: HostFnOperatorService,
): HostFnAdminService {
  return {
    listTargets: async (i, c) =>
      pageResult(
        (await operator.listTargets(scope(c))).filter(
          (x) => !i.status || x.status === i.status,
        ),
        i,
        c,
        pageIdentity("hostfn.targets.list", i.status),
      ),
    getTarget: async (i, c) => ({
      item:
        (await operator.getTarget(scope(c), i.id)) ?? notFound("target", i.id),
    }),
    restartTarget: async (i, c) => ({
      item: await operator.restart(scope(c), i.id),
    }),
    listDeployments: async (i, c) =>
      pageResult(
        await operator.listDeployments(scope(c), i.targetId),
        i,
        c,
        pageIdentity("hostfn.deployments.list", i.targetId),
      ),
    getDeployment: async (i, c) => ({
      item:
        (await operator.getDeployment(scope(c), i.id)) ??
        notFound("deployment", i.id),
    }),
    deploy: async (i, c) => ({ item: await operator.deploy(scope(c), i) }),
    cancelDeployment: async (i, c) => ({
      item: await operator.cancel(scope(c), i.id),
    }),
    rollbackDeployment: async (i, c) => ({
      item: await operator.rollback(scope(c), i.id),
    }),
    listDomains: async (i, c) =>
      pageResult(
        await operator.listDomains(scope(c), i.targetId),
        i,
        c,
        pageIdentity("hostfn.domains.list", i.targetId),
      ),
    attachDomain: async (i, c) => ({
      item: await operator.attachDomain(scope(c), i),
    }),
    detachDomain: async (i, c) => ({
      item: await operator.detachDomain(scope(c), i.id),
    }),
    listVariables: async (i, c) =>
      pageResult(
        await operator.listVariables(scope(c), i.targetId),
        i,
        c,
        pageIdentity("hostfn.variables.list", i.targetId),
      ),
    setVariable: async (i, c) => ({
      item: await operator.setVariable(scope(c), i),
    }),
    deleteVariable: async (i, c) => ({
      item: await operator.deleteVariable(scope(c), i.id),
    }),
  };
}
function notFound(resource: string, id: string): never {
  throw new AdminError("not_found", `HostFn ${resource} not found: ${id}`);
}
function bind(
  method: (input: never, context: AdminOperationContext) => Promise<unknown>,
) {
  return ({ input, context }: AdminOperationRequest) =>
    method(input as never, context);
}
export function createHostFnAdminAdapter(
  service: HostFnAdminService,
): AdminCapabilityAdapter<typeof hostFnAdminCapability> {
  return createKernelAdapter(hostFnAdminCapability, {
    "hostfn.targets.list": bind(service.listTargets as never),
    "hostfn.targets.get": bind(service.getTarget as never),
    "hostfn.targets.restart": bind(service.restartTarget as never),
    "hostfn.deployments.list": bind(service.listDeployments as never),
    "hostfn.deployments.get": bind(service.getDeployment as never),
    "hostfn.deployments.deploy": bind(service.deploy as never),
    "hostfn.deployments.cancel": bind(service.cancelDeployment as never),
    "hostfn.deployments.rollback": bind(service.rollbackDeployment as never),
    "hostfn.domains.list": bind(service.listDomains as never),
    "hostfn.domains.attach": bind(service.attachDomain as never),
    "hostfn.domains.detach": bind(service.detachDomain as never),
    "hostfn.variables.list": bind(service.listVariables as never),
    "hostfn.variables.set": bind(service.setVariable as never),
    "hostfn.variables.delete": bind(service.deleteVariable as never),
  });
}
export const adminCapability = hostFnAdminCapability;
export const createAdminAdapter = createHostFnAdminAdapter;
