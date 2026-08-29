import {
  defineAdminCapability,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationDefinition,
} from "@superfunctions/admin";
export interface MailFnAdminResourceDefinition {
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
export interface MailFnAdminActionDefinition {
  id: string;
  resource: string;
  title: string;
  description: string;
  classification: "write" | "destructive";
  requiresConfirmation: boolean;
  confirmation?: {
    risk: "high" | "critical";
    method: "explicit" | "recent-auth" | "mfa" | "approval";
    reason: string;
    maxAgeSeconds?: number;
  };
  idempotent: true;
  target: "resource" | "collection";
}
export const mailFnAdminResources = [
  {
    id: "projects",
    label: "Projects",
    description: "Inspect and operate projects in MailFn.",
    icon: "mailfn:projects",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "inboxes",
    label: "Inboxes",
    description: "Inspect and operate inboxes in MailFn.",
    icon: "mailfn:inboxes",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "messages",
    label: "Messages",
    description: "Inspect and operate messages in MailFn.",
    icon: "mailfn:messages",
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
    id: "threads",
    label: "Threads",
    description: "Inspect and operate threads in MailFn.",
    icon: "mailfn:threads",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "drafts",
    label: "Drafts",
    description: "Inspect and operate drafts in MailFn.",
    icon: "mailfn:drafts",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "attachments",
    label: "Attachments",
    description: "Inspect and operate attachments in MailFn.",
    icon: "mailfn:attachments",
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
    id: "credentials",
    label: "Credentials",
    description: "Inspect and operate credentials in MailFn.",
    icon: "mailfn:credentials",
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
    id: "domains-routes",
    label: "Domains Routes",
    description: "Inspect and operate domains routes in MailFn.",
    icon: "mailfn:domains-routes",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "webhooks",
    label: "Webhooks",
    description: "Inspect and operate webhooks in MailFn.",
    icon: "mailfn:webhooks",
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
    description: "Inspect and operate retention in MailFn.",
    icon: "mailfn:retention",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "quotas",
    label: "Quotas",
    description: "Inspect and operate quotas in MailFn.",
    icon: "mailfn:quotas",
    risk: "standard",
    idField: "id",
    displayFields: ["id", "name", "status", "updatedAt"],
    searchableFields: ["id", "name", "status"],
    filterableFields: ["status", "createdAt", "updatedAt"],
    sortableFields: ["createdAt", "updatedAt", "name"],
    sensitiveFields: [],
  },
  {
    id: "compliance-audit",
    label: "Compliance Audit",
    description: "Inspect and operate compliance audit in MailFn.",
    icon: "mailfn:compliance-audit",
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
] as const satisfies readonly MailFnAdminResourceDefinition[];
export const mailFnAdminActions = [
  {
    id: "create-inbox",
    resource: "inboxes",
    title: "Create Inbox",
    description: "Create Inbox for inboxes.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "collection",
  },
  {
    id: "expire-inbox",
    resource: "inboxes",
    title: "Expire Inbox",
    description: "Expire Inbox for inboxes.",
    classification: "destructive",
    requiresConfirmation: true,
    confirmation: {
      risk: "critical",
      method: "explicit",
      reason: "Expiring an inbox stops future delivery and changes externally visible addressing.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "resource",
  },
  {
    id: "label-message",
    resource: "messages",
    title: "Label Message",
    description: "Label Message for messages.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "send-draft",
    resource: "drafts",
    title: "Send Draft",
    description: "Send Draft for drafts.",
    classification: "write",
    requiresConfirmation: true,
    confirmation: {
      risk: "high",
      method: "explicit",
      reason: "Sending a draft delivers an irreversible message to external recipients.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "resource",
  },
  {
    id: "reply-draft",
    resource: "messages",
    title: "Reply Draft",
    description: "Create a reply draft from an existing message.",
    classification: "write",
    requiresConfirmation: false,
    idempotent: true,
    target: "resource",
  },
  {
    id: "manage-domain",
    resource: "domains-routes",
    title: "Manage Domain",
    description: "Manage Domain for domains routes.",
    classification: "write",
    requiresConfirmation: true,
    confirmation: {
      risk: "critical",
      method: "recent-auth",
      reason: "Domain verification or disablement changes externally visible inbound mail routing.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "resource",
  },
  {
    id: "create-webhook",
    resource: "webhooks",
    title: "Create Webhook",
    description: "Create a project or inbox-scoped webhook.",
    classification: "write",
    requiresConfirmation: true,
    confirmation: {
      risk: "high",
      method: "recent-auth",
      reason: "A webhook creates durable outbound delivery of scoped MailFn events to an external endpoint.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "collection",
  },
  {
    id: "rotate-credential",
    resource: "credentials",
    title: "Rotate Credential",
    description: "Rotate Credential for credentials.",
    classification: "write",
    requiresConfirmation: true,
    confirmation: {
      risk: "critical",
      method: "mfa",
      reason: "Credential rotation issues a replacement and revokes the active credential.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "resource",
  },
  {
    id: "purge",
    resource: "retention",
    title: "Purge",
    description: "Purge for retention.",
    classification: "destructive",
    requiresConfirmation: true,
    confirmation: {
      risk: "critical",
      method: "mfa",
      reason: "Retention purge irreversibly deletes retained mail evidence.",
      maxAgeSeconds: 300,
    },
    idempotent: true,
    target: "resource",
  },
] as const satisfies readonly MailFnAdminActionDefinition[];

export interface MailFnAdminResourcePolicy {
  defaultScope: "active";
  permission: string;
  redaction: "none" | "sensitive-fields";
}

export interface MailFnAdminOperationPolicy {
  permission: string;
  scope: {
    levels: readonly ["organization", "workspace", "project", "environment"];
    forwardsNamespace: true;
    forwardsRegion: true;
  };
  safety: {
    classification: "write" | "destructive";
    requiresConfirmation: boolean;
    confirmation?: MailFnAdminActionDefinition["confirmation"];
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
    domain: "mailfn";
    requestIdPath: "context.requestId";
    correlationIdPath: "context.correlationId";
  };
}

export const mailFnAdminResourcePolicies = Object.freeze(
  Object.fromEntries(
    mailFnAdminResources.map((resource) => [
      resource.id,
      {
        defaultScope: "active",
        permission: "mailfn." + resource.id + ".read",
        redaction:
          resource.sensitiveFields.length > 0 ? "sensitive-fields" : "none",
      } satisfies MailFnAdminResourcePolicy,
    ]),
  ),
) as Readonly<Record<string, MailFnAdminResourcePolicy>>;

export const mailFnAdminOperationPolicies = Object.freeze(
  Object.fromEntries(
    mailFnAdminActions.map((action) => [
      "mailfn." + action.resource + "." + action.id,
      {
        permission: "mailfn." + action.resource + "." + action.id,
        scope: {
          levels: ["organization", "workspace", "project", "environment"],
          forwardsNamespace: true,
          forwardsRegion: true,
        },
        safety: {
          classification: action.classification,
          requiresConfirmation: action.requiresConfirmation,
          ...("confirmation" in action ? { confirmation: action.confirmation } : {}),
        },
        idempotency: {
          mode: "required",
          keyStrategy: "context.idempotencyKey",
        },
        audit: {
          mode: "required",
          action: "mailfn." + action.id,
          targetResource: action.resource,
          ...(action.target === "resource"
            ? { targetIdPath: "$.id" as const }
            : { collection: true as const }),
        },
        observation: {
          domain: "mailfn",
          requestIdPath: "context.requestId",
          correlationIdPath: "context.correlationId",
        },
      } satisfies MailFnAdminOperationPolicy,
    ]),
  ),
) as Readonly<Record<string, MailFnAdminOperationPolicy>>;

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
const actionInputSchemas: Record<(typeof mailFnAdminActions)[number]["id"], AdminObjectSchema> = {
  "create-inbox": payloadSchema(
    {
      payload: payloadSchema(
        {
          kind: { type: "string", enum: ["stable", "expiring"] },
          requestedLocalPart: { type: "string", minLength: 1 },
          domain: { type: "string", minLength: 1 },
          displayName: { type: "string", minLength: 1 },
          expirySeconds: { type: "integer", minimum: 1 },
          metadata: { type: "object", additionalProperties: { type: "string" } },
        },
        ["kind"],
      ),
    },
    ["payload"],
  ),
  "expire-inbox": { ...getInputSchema },
  "label-message": payloadSchema(
    {
      id: { type: "string", minLength: 1 },
      payload: payloadSchema(
        { labels: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 100 } },
        ["labels"],
      ),
    },
    ["id", "payload"],
  ),
  "send-draft": { ...getInputSchema },
  "reply-draft": payloadSchema(
    {
      id: { type: "string", minLength: 1 },
      payload: payloadSchema({
        text: { type: "string" },
        html: { type: "string" },
        replyAll: { type: "boolean" },
      }),
    },
    ["id"],
  ),
  "manage-domain": payloadSchema(
    {
      id: { type: "string", minLength: 1 },
      payload: payloadSchema({ mode: { type: "string", enum: ["verify", "disable"] } }, ["mode"]),
    },
    ["id", "payload"],
  ),
  "create-webhook": payloadSchema(
    {
      payload: payloadSchema(
        {
          inboxId: { type: "string", minLength: 1 },
          url: { type: "string", minLength: 1 },
          eventTypes: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
        },
        ["url", "eventTypes"],
      ),
    },
    ["payload"],
  ),
  "rotate-credential": { ...getInputSchema },
  purge: { ...getInputSchema },
};
export const mailFnAdminSchemas = {
  entity: entitySchema,
  listInput: listInputSchema,
  listOutput: listOutputSchema,
  getInput: getInputSchema,
  getOutput: getOutputSchema,
  actionInput: actionInputSchema,
  actionOutput: actionOutputSchema,
} as const satisfies Record<string, AdminJsonSchema>;
function resourceOperations(
  resource: MailFnAdminResourceDefinition,
): AdminOperationDefinition[] {
  const baseId = "mailfn." + resource.id,
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
      permission: "mailfn." + resource.id + ".read",
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
      permission: "mailfn." + resource.id + ".read",
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
  action: MailFnAdminActionDefinition,
): AdminOperationDefinition {
  const sensitiveFields =
    mailFnAdminResources.find((resource) => resource.id === action.resource)
      ?.sensitiveFields ?? [];
  return {
    id: "mailfn." + action.resource + "." + action.id,
    title: action.title,
    description: action.description,
    inputSchema:
      actionInputSchemas[action.id as (typeof mailFnAdminActions)[number]["id"]],
    outputSchema: actionOutputSchema,
    route: {
      method: "POST",
      path: "/resources/" + action.resource + "/actions/" + action.id,
    },
    permission: "mailfn." + action.resource + "." + action.id,
    minimumScope: "project",
    safety: {
      classification: action.classification,
      idempotent: action.idempotent,
      requiresConfirmation: action.requiresConfirmation,
      ...("confirmation" in action ? { confirmation: action.confirmation } : {}),
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
const operations: AdminOperationDefinition[] = [
  ...mailFnAdminResources.flatMap(resourceOperations),
  ...mailFnAdminActions.map(actionOperation),
];
type FunctionAdminActionOperationId<TModule extends string, TAction> =
  TAction extends { resource: infer TResource extends string; id: infer TActionId extends string }
    ? `${TModule}.${TResource}.${TActionId}`
    : never;
export type MailFnAdminOperationId =
  | `mailfn.${(typeof mailFnAdminResources)[number]["id"]}.list`
  | `mailfn.${(typeof mailFnAdminResources)[number]["id"]}.get`
  | FunctionAdminActionOperationId<"mailfn", (typeof mailFnAdminActions)[number]>;
export const mailFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "mailfn",
  displayName: "MailFn",
  version: "1.0.0",
  description:
    "Function-owned MailFn operator capabilities backed by a scoped MailFn service.",
  category: "communication",
  availability: "required-product",
  scopeLevels: ["organization", "workspace", "project", "environment"],
  dependencies: [],
  resources: mailFnAdminResources,
  navigation: [
    {
      id: "mailfn",
      label: "MailFn",
      path: "/modules/mailfn",
      icon: "mailfn",
      description: "Operate MailFn in the active scope.",
      order: 100,
    },
  ],
  operations: operations as readonly (AdminOperationDefinition & { readonly id: MailFnAdminOperationId })[],
});
export const adminCapability = mailFnAdminCapability;
export * from "./types.js";
export * from "./adapter.js";
export * from "./client.js";
export {
  createMailFnDomainAdminService,
  type MailFnDomainAdminServiceOptions,
} from "./domain-service.js";
