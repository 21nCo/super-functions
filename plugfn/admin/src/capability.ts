import {
  defineAdminCapability,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationDefinition,
  type AdminResourceDefinition,
  type AdminRouteDefinition,
  type AdminSafetyDefinition,
} from "@superfunctions/admin";
import type {
  PlugFnAcceptedOutput,
  PlugFnAuthorizeConnectionInput,
  PlugFnAuthorizeConnectionOutput,
  PlugFnCancelSyncInput,
  PlugFnConnectionGetInput,
  PlugFnConnectionListInput,
  PlugFnConnectionTargetInput,
  PlugFnConnectionView,
  PlugFnDisconnectOutput,
  PlugFnInstallationListInput,
  PlugFnInstallationTargetInput,
  PlugFnInstallationView,
  PlugFnItemOutput,
  PlugFnListOutput,
  PlugFnProviderGetInput,
  PlugFnProviderListInput,
  PlugFnProviderView,
  PlugFnRunSyncInput,
  PlugFnSyncJobGetInput,
  PlugFnSyncJobListInput,
  PlugFnWebhookDeliveryListInput,
  PlugFnWebhookReceiptGetInput,
  PlugFnWorkflowListInput,
  PlugFnWorkflowTargetInput,
  PlugFnWorkflowView,
} from "./types.js";

const stringSchema: AdminJsonSchema = { type: "string", minLength: 1 };
const dateSchema: AdminJsonSchema = { type: "string", minLength: 1 };
const cursorProperties = {
  cursor: { type: "string", minLength: 1 },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
} as const;
const idInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: stringSchema },
  required: ["id"],
  additionalProperties: false,
};
const acceptedSchema: AdminObjectSchema = {
  type: "object",
  properties: { accepted: { type: "boolean", const: true } },
  required: ["accepted"],
  additionalProperties: true,
};
const acceptedItemSchema = (item: AdminJsonSchema): AdminObjectSchema => ({
  type: "object",
  properties: { accepted: { type: "boolean", const: true }, item },
  required: ["accepted", "item"],
  additionalProperties: false,
});
const itemSchema = (item: AdminJsonSchema): AdminObjectSchema => ({
  type: "object",
  properties: { item },
  required: ["item"],
  additionalProperties: false,
});
const listSchema = (item: AdminJsonSchema): AdminObjectSchema => ({
  type: "object",
  properties: {
    items: { type: "array", items: item },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["items", "nextCursor"],
  additionalProperties: false,
});

const providerSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, name: stringSchema, displayName: stringSchema,
    description: { type: "string" }, version: stringSchema, iconUrl: { type: "string" },
    authType: stringSchema, configured: { type: "boolean" },
    actions: { type: "array", items: stringSchema },
    triggers: { type: "array", items: stringSchema },
    webhookEvents: { type: "array", items: stringSchema },
    syncResources: { type: "array", items: stringSchema },
    capabilities: { type: "object", additionalProperties: { type: "boolean" } },
  },
  required: ["id", "name", "displayName", "description", "version", "authType", "configured", "actions", "triggers", "webhookEvents", "syncResources", "capabilities"],
  additionalProperties: false,
};
const connectionSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, provider: stringSchema,
    ownerKind: { type: "string", enum: ["user", "organization", "delegated"] }, ownerId: { type: "string" },
    name: { type: "string" }, status: { type: "string", enum: ["active", "expired", "revoked", "error"] },
    scopes: { type: "array", items: stringSchema }, expiresAt: dateSchema, connectedAt: dateSchema,
    lastUsedAt: dateSchema, createdAt: dateSchema, updatedAt: dateSchema, hasCredentials: { type: "boolean" },
  },
  required: ["id", "provider", "status", "connectedAt", "createdAt", "updatedAt", "hasCredentials"],
  additionalProperties: false,
};
const installationSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, provider: stringSchema,
    ownerKind: { type: "string", enum: ["user", "organization", "delegated"] }, ownerId: stringSchema,
    status: { type: "string", enum: ["active", "disabled", "revoked", "error"] },
    scopes: { type: "array", items: stringSchema }, createdAt: dateSchema, updatedAt: dateSchema,
  },
  required: ["id", "provider", "ownerKind", "ownerId", "status", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const workflowSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, name: stringSchema, description: { type: "string" },
    status: { type: "string", enum: ["enabled", "disabled", "draft"] },
    trigger: { type: "object", properties: { provider: stringSchema, event: stringSchema }, required: ["provider", "event"], additionalProperties: false },
    steps: { type: "array", items: { type: "object", properties: { id: stringSchema, type: stringSchema }, required: ["id", "type"], additionalProperties: false } },
    createdAt: dateSchema, updatedAt: dateSchema,
  },
  required: ["id", "name", "status", "trigger", "steps", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const workflowStatsSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    totalExecutions: { type: "integer", minimum: 0 }, successfulExecutions: { type: "integer", minimum: 0 },
    failedExecutions: { type: "integer", minimum: 0 }, successRate: { type: "number", minimum: 0, maximum: 100 },
    avgDuration: { type: "number", minimum: 0 }, lastExecutedAt: dateSchema,
  },
  required: ["totalExecutions", "successfulExecutions", "failedExecutions", "successRate", "avgDuration"],
  additionalProperties: false,
};
const webhookReceiptSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, provider: stringSchema, event: stringSchema, connectionId: { type: "string" },
    ownerKind: { type: "string", enum: ["user", "organization", "delegated"] }, ownerId: { type: "string" },
    payloadHash: stringSchema, verificationStatus: { type: "string", enum: ["verified", "failed", "not-required"] },
    receivedAt: dateSchema, createdAt: dateSchema,
  },
  required: ["id", "provider", "event", "payloadHash", "verificationStatus", "receivedAt", "createdAt"],
  additionalProperties: false,
};
const webhookDeliverySchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, receiptId: stringSchema, sinkId: { type: "string" }, handlerName: { type: "string" },
    status: { type: "string", enum: ["pending", "running", "success", "failed", "dead-lettered"] },
    attempts: { type: "integer", minimum: 0 }, nextAttemptAt: dateSchema, error: { type: "string" }, createdAt: dateSchema, updatedAt: dateSchema,
  },
  required: ["id", "receiptId", "status", "attempts", "createdAt", "updatedAt"],
  additionalProperties: false,
};
const syncJobSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema, provider: stringSchema, connectionId: stringSchema, resource: stringSchema,
    mode: { type: "string", enum: ["full", "incremental"] },
    status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] },
    ownerKind: { type: "string", enum: ["user", "organization", "delegated"] }, ownerId: { type: "string" },
    fetchedCount: { type: "integer", minimum: 0 }, persistedCount: { type: "integer", minimum: 0 }, skippedCount: { type: "integer", minimum: 0 },
    error: { type: "string" }, createdAt: dateSchema, updatedAt: dateSchema,
  },
  required: ["id", "provider", "connectionId", "resource", "mode", "status", "fetchedCount", "persistedCount", "skippedCount", "createdAt", "updatedAt"],
  additionalProperties: false,
};

const providerListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, search: { type: "string", maxLength: 200 } }, additionalProperties: false };
const connectionListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, provider: stringSchema, status: { type: "string", enum: ["active", "expired", "revoked", "error"] } }, additionalProperties: false };
const installationListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, provider: stringSchema, status: { type: "string", enum: ["active", "disabled", "revoked", "error"] } }, additionalProperties: false };
const workflowListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, provider: stringSchema, status: { type: "string", enum: ["enabled", "disabled", "draft"] } }, additionalProperties: false };
const deliveryListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, receiptId: stringSchema }, required: ["receiptId"], additionalProperties: false };
const syncListInput: AdminObjectSchema = { type: "object", properties: { ...cursorProperties, provider: stringSchema, connectionId: stringSchema, resource: stringSchema, status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] } }, additionalProperties: false };
const authorizeInput: AdminObjectSchema = {
  type: "object",
  properties: {
    provider: stringSchema, redirectUri: { type: "string", minLength: 1, maxLength: 2000 }, scopes: { type: "array", items: stringSchema, uniqueItems: true, maxItems: 100 },
    connectionName: { type: "string", maxLength: 200 }, returnTo: { type: "string", maxLength: 2000 }, prompt: { type: "string", maxLength: 200 }, loginHint: { type: "string", maxLength: 500 },
  },
  required: ["provider", "redirectUri"],
  additionalProperties: false,
};
const authorizeOutput: AdminObjectSchema = { type: "object", properties: { accepted: { type: "boolean", const: true }, authUrl: { type: "string", minLength: 1, maxLength: 10000 } }, required: ["accepted", "authUrl"], additionalProperties: false };
const disconnectOutput: AdminObjectSchema = { type: "object", properties: { accepted: { type: "boolean", const: true }, disconnected: { type: "boolean" }, remoteRevokeAttempted: { type: "boolean" }, remoteRevokeSucceeded: { type: "boolean" }, localDeleted: { type: "boolean" } }, required: ["accepted", "disconnected", "remoteRevokeAttempted", "remoteRevokeSucceeded", "localDeleted"], additionalProperties: false };
const runSyncInput: AdminObjectSchema = {
  type: "object",
  properties: { provider: stringSchema, connectionId: stringSchema, resource: stringSchema, mode: { type: "string", enum: ["full", "incremental"] }, sinkId: stringSchema, maxPages: { type: "integer", minimum: 1, maximum: 1000 } },
  required: ["provider", "connectionId", "resource", "mode"],
  additionalProperties: false,
};

export const plugFnAdminResources = [
  { id: "providers", label: "Providers", description: "Sanitized provider definitions registered in the project-owned PlugFn runtime.", icon: "plugfn:providers", risk: "standard", minimumScope: "project", idField: "id", displayFields: ["id", "displayName", "version", "authType", "configured"], searchableFields: ["id", "displayName", "description"], filterableFields: ["configured", "authType"], sortableFields: ["displayName", "id"], sensitiveFields: [] },
  { id: "connections", label: "Connections", description: "Provider connections owned by the mapped PlugFn principal.", icon: "plugfn:connections", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "provider", "name", "status", "updatedAt"], searchableFields: ["id", "provider", "name"], filterableFields: ["provider", "status"], sortableFields: ["createdAt", "updatedAt"], sensitiveFields: ["credentials", "authorization", "token", "secret"] },
  { id: "provider-installations", label: "Provider installations", description: "Provider installations owned by the active PlugFn identity.", icon: "plugfn:provider-installations", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "provider", "ownerKind", "status", "updatedAt"], searchableFields: ["id", "provider"], filterableFields: ["provider", "status", "ownerKind"], sortableFields: ["createdAt", "updatedAt"], sensitiveFields: ["metadata", "secret", "token"] },
  { id: "workflows", label: "Workflows", description: "Workflow definitions owned by the mapped PlugFn user.", icon: "plugfn:workflows", risk: "standard", minimumScope: "project", idField: "id", displayFields: ["id", "name", "status", "updatedAt"], searchableFields: ["id", "name", "description"], filterableFields: ["status", "provider"], sortableFields: ["createdAt", "updatedAt", "name"], sensitiveFields: ["metadata"] },
  { id: "webhook-receipts", label: "Webhook receipts", description: "Verified webhook evidence addressable inside the active PlugFn identity.", icon: "plugfn:webhook-receipts", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "provider", "event", "verificationStatus", "receivedAt"], searchableFields: ["id", "provider", "event"], filterableFields: ["provider", "verificationStatus"], sortableFields: ["receivedAt"], sensitiveFields: ["headersRedacted", "metadata"] },
  { id: "webhook-deliveries", label: "Webhook deliveries", description: "Delivery attempts attached to an authorized PlugFn webhook receipt.", icon: "plugfn:webhook-deliveries", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "receiptId", "status", "attempts", "updatedAt"], searchableFields: ["id", "receiptId", "handlerName"], filterableFields: ["receiptId", "status"], sortableFields: ["createdAt", "updatedAt"], sensitiveFields: ["metadata"] },
  { id: "sync-jobs", label: "Sync jobs", description: "Scoped PlugFn provider synchronization jobs and durable progress.", icon: "plugfn:sync-jobs", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "provider", "resource", "mode", "status", "updatedAt"], searchableFields: ["id", "provider", "resource", "connectionId"], filterableFields: ["provider", "resource", "connectionId", "status"], sortableFields: ["createdAt", "updatedAt"], sensitiveFields: ["checkpoint", "metadata"] },
] as const satisfies readonly AdminResourceDefinition[];

type Target = { resource: string; collection: true } | { resource: string; idInput: string };
function read<const TId extends string, TInput, TOutput>(options: { id: TId; title: string; description: string; schema: AdminJsonSchema; output: AdminJsonSchema; route: AdminRouteDefinition; permission: string; target: Target; pagination?: boolean; redaction?: readonly string[] }): AdminOperationDefinition<TInput, TOutput> & { readonly id: TId } {
  return {
    id: options.id, title: options.title, description: options.description, inputSchema: options.schema, outputSchema: options.output,
    route: options.route, permission: options.permission, minimumScope: "project",
    safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: options.redaction?.length ? "required" : "optional" },
    ...(options.pagination ? { pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 } as const } : {}),
    mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    ...(options.redaction?.length ? { redaction: { outputFields: options.redaction } } : {}), target: options.target,
  } as AdminOperationDefinition<TInput, TOutput> & { readonly id: TId };
}
function mutation<const TId extends string, TInput, TOutput>(options: { id: TId; title: string; description: string; schema: AdminJsonSchema; output: AdminJsonSchema; route: string; permission: string; target: Target; destructive?: boolean; idempotent?: boolean; confirmation?: AdminSafetyDefinition["confirmation"]; inputRedaction?: readonly string[]; outputRedaction?: readonly string[] }): AdminOperationDefinition<TInput, TOutput> & { readonly id: TId } {
  const destructive = options.destructive ?? false;
  const safety: AdminSafetyDefinition = { classification: destructive ? "destructive" : "write", idempotent: options.idempotent ?? true, requiresConfirmation: Boolean(options.confirmation), ...(options.confirmation ? { confirmation: options.confirmation } : {}), audit: "required" };
  const redaction = options.inputRedaction?.length || options.outputRedaction?.length ? { ...(options.inputRedaction?.length ? { inputFields: options.inputRedaction } : {}), ...(options.outputRedaction?.length ? { outputFields: options.outputRedaction } : {}) } : undefined;
  return {
    id: options.id, title: options.title, description: options.description, inputSchema: options.schema, outputSchema: options.output,
    route: { method: "POST", path: options.route }, permission: options.permission, minimumScope: "project", safety,
    mcp: { readOnlyHint: false, destructiveHint: destructive, idempotentHint: options.idempotent ?? true }, ...(redaction ? { redaction } : {}), target: options.target,
  } as AdminOperationDefinition<TInput, TOutput> & { readonly id: TId };
}

const operations = [
  read<"plugfn.providers.list", PlugFnProviderListInput, PlugFnListOutput<PlugFnProviderView>>({ id: "plugfn.providers.list", title: "List providers", description: "List sanitized providers registered in the project-owned PlugFn runtime.", schema: providerListInput, output: listSchema(providerSchema), route: { method: "GET", path: "/resources/providers" }, permission: "plugfn.providers.read", target: { resource: "providers", collection: true }, pagination: true }),
  read<"plugfn.providers.get", PlugFnProviderGetInput, PlugFnItemOutput<PlugFnProviderView>>({ id: "plugfn.providers.get", title: "Get provider", description: "Get one sanitized PlugFn provider definition without integration secrets or executable handlers.", schema: idInputSchema, output: itemSchema(providerSchema), route: { method: "GET", path: "/resources/providers/:id" }, permission: "plugfn.providers.read", target: { resource: "providers", idInput: "id" } }),
  read<"plugfn.connections.list", PlugFnConnectionListInput, PlugFnListOutput<PlugFnConnectionView>>({ id: "plugfn.connections.list", title: "List connections", description: "List provider connections owned by the mapped PlugFn principal.", schema: connectionListInput, output: listSchema(connectionSchema), route: { method: "GET", path: "/resources/connections" }, permission: "plugfn.connections.read", target: { resource: "connections", collection: true }, pagination: true, redaction: ["credentials", "token", "secret"] }),
  read<"plugfn.connections.get", PlugFnConnectionGetInput, PlugFnItemOutput<PlugFnConnectionView>>({ id: "plugfn.connections.get", title: "Get connection", description: "Get one provider connection after PlugFn owner verification.", schema: idInputSchema, output: itemSchema(connectionSchema), route: { method: "GET", path: "/resources/connections/:id" }, permission: "plugfn.connections.read", target: { resource: "connections", idInput: "id" }, redaction: ["credentials", "token", "secret"] }),
  mutation<"plugfn.connections.authorize", PlugFnAuthorizeConnectionInput, PlugFnAuthorizeConnectionOutput>({ id: "plugfn.connections.authorize", title: "Authorize connection", description: "Start PlugFn's configured OAuth flow and return the provider authorization URL.", schema: authorizeInput, output: authorizeOutput, route: "/resources/connections/actions/authorize", permission: "plugfn.connections.authorize", target: { resource: "connections", collection: true }, idempotent: false, confirmation: { risk: "high", method: "recent-auth", reason: "Starting provider OAuth can authorize durable external access.", maxAgeSeconds: 300 }, inputRedaction: ["loginHint"] }),
  mutation<"plugfn.connections.refresh", PlugFnConnectionTargetInput, PlugFnItemOutput<PlugFnConnectionView>>({ id: "plugfn.connections.refresh", title: "Refresh connection", description: "Refresh one owned PlugFn connection through its configured provider.", schema: idInputSchema, output: itemSchema(connectionSchema), route: "/resources/connections/actions/refresh", permission: "plugfn.connections.refresh", target: { resource: "connections", idInput: "id" }, idempotent: false, confirmation: { risk: "critical", method: "mfa", reason: "Refreshing rotates or replaces externally issued provider credentials.", maxAgeSeconds: 300 }, outputRedaction: ["credentials", "token", "secret"] }),
  mutation<"plugfn.connections.disconnect", PlugFnConnectionTargetInput, PlugFnDisconnectOutput>({ id: "plugfn.connections.disconnect", title: "Disconnect connection", description: "Revoke and remove an owned PlugFn connection.", schema: idInputSchema, output: disconnectOutput, route: "/resources/connections/actions/disconnect", permission: "plugfn.connections.disconnect", target: { resource: "connections", idInput: "id" }, destructive: true, confirmation: { risk: "critical", method: "mfa", reason: "Disconnecting revokes provider access and removes the local connection.", maxAgeSeconds: 300 } }),
  read<"plugfn.provider-installations.list", PlugFnInstallationListInput, PlugFnListOutput<PlugFnInstallationView>>({ id: "plugfn.provider-installations.list", title: "List provider installations", description: "List PlugFn installations owned by the active identity.", schema: installationListInput, output: listSchema(installationSchema), route: { method: "GET", path: "/resources/provider-installations" }, permission: "plugfn.provider-installations.read", target: { resource: "provider-installations", collection: true }, pagination: true, redaction: ["metadata", "secret", "token"] }),
  read<"plugfn.provider-installations.get", PlugFnInstallationTargetInput, PlugFnItemOutput<PlugFnInstallationView>>({ id: "plugfn.provider-installations.get", title: "Get provider installation", description: "Get one owned PlugFn provider installation.", schema: idInputSchema, output: itemSchema(installationSchema), route: { method: "GET", path: "/resources/provider-installations/:id" }, permission: "plugfn.provider-installations.read", target: { resource: "provider-installations", idInput: "id" }, redaction: ["metadata", "secret", "token"] }),
  mutation<"plugfn.provider-installations.disable", PlugFnInstallationTargetInput, PlugFnAcceptedOutput<PlugFnInstallationView>>({ id: "plugfn.provider-installations.disable", title: "Mark provider installation disabled", description: "Persist disabled lifecycle status on one owned PlugFn provider installation.", schema: idInputSchema, output: acceptedItemSchema(installationSchema), route: "/resources/provider-installations/actions/disable", permission: "plugfn.provider-installations.disable", target: { resource: "provider-installations", idInput: "id" }, confirmation: { risk: "high", method: "recent-auth", reason: "Disabling an installation stops provider credential use until it is re-enabled.", maxAgeSeconds: 300 }, outputRedaction: ["metadata", "secret", "token"] }),
  mutation<"plugfn.provider-installations.revoke", PlugFnInstallationTargetInput, PlugFnAcceptedOutput<PlugFnInstallationView>>({ id: "plugfn.provider-installations.revoke", title: "Mark provider installation revoked", description: "Persist revoked lifecycle status on one owned PlugFn provider installation.", schema: idInputSchema, output: acceptedItemSchema(installationSchema), route: "/resources/provider-installations/actions/revoke", permission: "plugfn.provider-installations.revoke", target: { resource: "provider-installations", idInput: "id" }, destructive: true, confirmation: { risk: "critical", method: "mfa", reason: "This marks the durable installation record revoked; it does not export or rotate provider credentials.", maxAgeSeconds: 300 }, outputRedaction: ["metadata", "secret", "token"] }),
  read<"plugfn.workflows.list", PlugFnWorkflowListInput, PlugFnListOutput<PlugFnWorkflowView>>({ id: "plugfn.workflows.list", title: "List workflows", description: "List workflows owned by the mapped PlugFn user.", schema: workflowListInput, output: listSchema(workflowSchema), route: { method: "GET", path: "/resources/workflows" }, permission: "plugfn.workflows.read", target: { resource: "workflows", collection: true }, pagination: true, redaction: ["metadata"] }),
  read<"plugfn.workflows.get", PlugFnWorkflowTargetInput, PlugFnItemOutput<PlugFnWorkflowView>>({ id: "plugfn.workflows.get", title: "Get workflow", description: "Get a sanitized workflow after owner verification.", schema: idInputSchema, output: itemSchema(workflowSchema), route: { method: "GET", path: "/resources/workflows/:id" }, permission: "plugfn.workflows.read", target: { resource: "workflows", idInput: "id" }, redaction: ["metadata"] }),
  read<"plugfn.workflows.stats", PlugFnWorkflowTargetInput, PlugFnItemOutput<Record<string, unknown>>>({ id: "plugfn.workflows.stats", title: "Get workflow statistics", description: "Get execution statistics for one owned PlugFn workflow.", schema: idInputSchema, output: itemSchema(workflowStatsSchema), route: { method: "GET", path: "/resources/workflows/:id/stats" }, permission: "plugfn.workflows.read", target: { resource: "workflows", idInput: "id" } }),
  mutation<"plugfn.workflows.enable", PlugFnWorkflowTargetInput, PlugFnAcceptedOutput>({ id: "plugfn.workflows.enable", title: "Enable workflow", description: "Enable one owned PlugFn workflow and its trigger.", schema: idInputSchema, output: acceptedSchema, route: "/resources/workflows/actions/enable", permission: "plugfn.workflows.write", target: { resource: "workflows", idInput: "id" }, confirmation: { risk: "high", method: "explicit", reason: "Enabling a workflow activates its provider triggers and external side effects.", maxAgeSeconds: 300 } }),
  mutation<"plugfn.workflows.disable", PlugFnWorkflowTargetInput, PlugFnAcceptedOutput>({ id: "plugfn.workflows.disable", title: "Disable workflow", description: "Disable one owned PlugFn workflow and its trigger.", schema: idInputSchema, output: acceptedSchema, route: "/resources/workflows/actions/disable", permission: "plugfn.workflows.write", target: { resource: "workflows", idInput: "id" }, confirmation: { risk: "high", method: "explicit", reason: "Disabling a workflow changes externally driven automation.", maxAgeSeconds: 300 } }),
  mutation<"plugfn.workflows.delete", PlugFnWorkflowTargetInput, PlugFnAcceptedOutput>({ id: "plugfn.workflows.delete", title: "Delete workflow", description: "Permanently delete one owned PlugFn workflow.", schema: idInputSchema, output: acceptedSchema, route: "/resources/workflows/actions/delete", permission: "plugfn.workflows.delete", target: { resource: "workflows", idInput: "id" }, destructive: true, confirmation: { risk: "critical", method: "mfa", reason: "Workflow deletion is permanent and removes its trigger registration.", maxAgeSeconds: 300 } }),
  read<"plugfn.webhook-receipts.get", PlugFnWebhookReceiptGetInput, PlugFnItemOutput<Record<string, unknown>>>({ id: "plugfn.webhook-receipts.get", title: "Get webhook receipt", description: "Get one PlugFn webhook receipt after owner verification.", schema: idInputSchema, output: itemSchema(webhookReceiptSchema), route: { method: "GET", path: "/resources/webhook-receipts/:id" }, permission: "plugfn.webhook-receipts.read", target: { resource: "webhook-receipts", idInput: "id" }, redaction: ["headersRedacted", "metadata"] }),
  read<"plugfn.webhook-deliveries.list", PlugFnWebhookDeliveryListInput, PlugFnListOutput<Record<string, unknown>>>({ id: "plugfn.webhook-deliveries.list", title: "List webhook deliveries", description: "List delivery attempts for one authorized PlugFn webhook receipt.", schema: deliveryListInput, output: listSchema(webhookDeliverySchema), route: { method: "GET", path: "/resources/webhook-deliveries" }, permission: "plugfn.webhook-deliveries.read", target: { resource: "webhook-deliveries", collection: true }, pagination: true, redaction: ["metadata"] }),
  read<"plugfn.sync-jobs.list", PlugFnSyncJobListInput, PlugFnListOutput<Record<string, unknown>>>({ id: "plugfn.sync-jobs.list", title: "List sync jobs", description: "List PlugFn sync jobs owned by the active identity.", schema: syncListInput, output: listSchema(syncJobSchema), route: { method: "GET", path: "/resources/sync-jobs" }, permission: "plugfn.sync-jobs.read", target: { resource: "sync-jobs", collection: true }, pagination: true, redaction: ["checkpoint", "metadata"] }),
  read<"plugfn.sync-jobs.get", PlugFnSyncJobGetInput, PlugFnItemOutput<Record<string, unknown>>>({ id: "plugfn.sync-jobs.get", title: "Get sync job", description: "Get one PlugFn sync job after owner verification.", schema: idInputSchema, output: itemSchema(syncJobSchema), route: { method: "GET", path: "/resources/sync-jobs/:id" }, permission: "plugfn.sync-jobs.read", target: { resource: "sync-jobs", idInput: "id" }, redaction: ["checkpoint", "metadata"] }),
  mutation<"plugfn.sync-jobs.run", PlugFnRunSyncInput, PlugFnAcceptedOutput<Record<string, unknown>>>({ id: "plugfn.sync-jobs.run", title: "Run sync", description: "Run a full or incremental PlugFn provider sync through its registered sink.", schema: runSyncInput, output: acceptedItemSchema(syncJobSchema), route: "/resources/sync-jobs/actions/run", permission: "plugfn.sync-jobs.run", target: { resource: "sync-jobs", collection: true }, idempotent: false, confirmation: { risk: "high", method: "explicit", reason: "Running a provider sync reads external data and writes through the configured sink.", maxAgeSeconds: 300 }, inputRedaction: ["sinkId"] }),
  mutation<"plugfn.sync-jobs.enqueue", PlugFnRunSyncInput, PlugFnAcceptedOutput<Record<string, unknown>>>({ id: "plugfn.sync-jobs.enqueue", title: "Enqueue sync", description: "Persist a scoped PlugFn sync job for asynchronous processing.", schema: runSyncInput, output: acceptedItemSchema(syncJobSchema), route: "/resources/sync-jobs/actions/enqueue", permission: "plugfn.sync-jobs.enqueue", target: { resource: "sync-jobs", collection: true }, idempotent: false, confirmation: { risk: "high", method: "explicit", reason: "Enqueueing schedules a provider sync with external reads and sink writes.", maxAgeSeconds: 300 }, inputRedaction: ["sinkId"] }),
  mutation<"plugfn.sync-jobs.cancel", PlugFnCancelSyncInput, PlugFnAcceptedOutput<Record<string, unknown>>>({ id: "plugfn.sync-jobs.cancel", title: "Cancel sync", description: "Mark an owned queued or running PlugFn sync job cancelled.", schema: idInputSchema, output: acceptedItemSchema(syncJobSchema), route: "/resources/sync-jobs/actions/cancel", permission: "plugfn.sync-jobs.cancel", target: { resource: "sync-jobs", idInput: "id" }, destructive: true, confirmation: { risk: "high", method: "explicit", reason: "This prevents queued claiming; an already-running provider request may still finish and leave partial progress." } }),
] as const;

export const plugFnAdminOperations = operations;
export type PlugFnAdminOperationId = (typeof plugFnAdminOperations)[number]["id"];

export const plugFnAdminActions = [
  { id: "authorize", resource: "connections" }, { id: "refresh", resource: "connections" }, { id: "disconnect", resource: "connections" },
  { id: "disable", resource: "provider-installations" }, { id: "revoke", resource: "provider-installations" },
  { id: "enable", resource: "workflows" }, { id: "disable", resource: "workflows" }, { id: "delete", resource: "workflows" },
  { id: "run", resource: "sync-jobs" }, { id: "enqueue", resource: "sync-jobs" }, { id: "cancel", resource: "sync-jobs" },
] as const;

export const plugFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "plugfn",
  displayName: "PlugFn",
  version: "1.1.0",
  description: "Project-scoped integration administration backed by PlugFn's public facade.",
  category: "integrations",
  availability: "required-product",
  scopeLevels: ["installation", "workspace", "project", "environment"],
  dependencies: [],
  resources: plugFnAdminResources,
  navigation: [{ id: "plugfn", label: "PlugFn", path: "/modules/plugfn", icon: "plugfn", description: "Operate project-owned provider connections, workflows, webhooks, and sync jobs.", order: 100 }],
  operations: plugFnAdminOperations,
});

export const plugFnAdminSchemas = { provider: providerSchema, connection: connectionSchema, installation: installationSchema, workflow: workflowSchema, workflowStats: workflowStatsSchema, webhookReceipt: webhookReceiptSchema, webhookDelivery: webhookDeliverySchema, syncJob: syncJobSchema } as const;
