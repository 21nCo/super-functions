import {
  type Connection,
  type PlugFnConnectionOwner,
  type PlugFnProviderInstallation,
  type PlugFnSyncJob,
  type PlugFnWebhookReceipt,
  type Provider,
  type Workflow,
} from "plugfn";
import {
  AdminError,
  decodeAdminCursor,
  encodeAdminCursor,
  normalizeAdminPageLimit,
  type AdminOperationContext,
} from "@superfunctions/admin";
import type {
  PlugFnAdminService,
  PlugFnAdminJson,
  PlugFnConnectionView,
  PlugFnDomainAdminServiceOptions,
  PlugFnDomainIdentity,
  PlugFnInstallationView,
  PlugFnPageInput,
  PlugFnProviderView,
  PlugFnWorkflowView,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

function json<T>(value: T): PlugFnAdminJson<T> {
  const visit = (current: unknown): unknown => {
    if (current instanceof Date) return current.toISOString();
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(Object.entries(current as JsonRecord).filter(([, item]) => item !== undefined).map(([key, item]) => [key, visit(item)]));
  };
  return visit(value) as PlugFnAdminJson<T>;
}

function page<T>(values: readonly T[], input: PlugFnPageInput, context: AdminOperationContext): { items: T[]; nextCursor: string | null } {
  const limit = normalizeAdminPageLimit(input.limit, { defaultLimit: 50, maxLimit: 100 });
  const decoded = input.cursor ? decodeAdminCursor<{ offset?: unknown }>(input.cursor, context.scope) : { offset: 0 };
  const offset = decoded.offset ?? 0;
  if (!Number.isInteger(offset) || (offset as number) < 0) throw new AdminError("invalid_argument", "The PlugFn cursor is invalid.");
  const items = values.slice(offset as number, (offset as number) + limit);
  const nextOffset = (offset as number) + items.length;
  return { items: [...items], nextCursor: nextOffset < values.length ? encodeAdminCursor(context.scope, { offset: nextOffset }) : null };
}

function assertProject(options: PlugFnDomainAdminServiceOptions, context: AdminOperationContext): void {
  if (context.scope.projectId !== options.projectId) throw new AdminError("forbidden", "The active project cannot access this PlugFn runtime.");
}

async function identity(options: PlugFnDomainAdminServiceOptions, context: AdminOperationContext): Promise<PlugFnDomainIdentity> {
  assertProject(options, context);
  const mapped = await options.identity(context);
  if (!mapped.userId?.trim()) throw new AdminError("invalid_argument", "PlugFn administration requires a mapped userId.");
  return mapped;
}

function ownerFor(value: PlugFnDomainIdentity): PlugFnConnectionOwner {
  return value.organizationId
    ? { kind: "organization", organizationId: value.organizationId, installedByUserId: value.userId, tenantId: value.tenantId }
    : { kind: "user", userId: value.userId, tenantId: value.tenantId };
}

function owns(ownerKind: string | undefined, ownerId: string | undefined, value: PlugFnDomainIdentity): boolean {
  if (value.organizationId) return ownerKind === "organization" && ownerId === value.organizationId;
  return ownerKind === "user" && ownerId === value.userId;
}

function assertConnectionOwner(connection: Connection, value: PlugFnDomainIdentity): void {
  if (!connection.ownerKind && !connection.ownerId && connection.userId === value.userId) return;
  if (connection.ownerKind === "delegated" && value.organizationId && connection.ownerId === value.organizationId && connection.delegatedToUserId === value.userId) return;
  if (owns(connection.ownerKind, connection.ownerId, value)) return;
  throw new AdminError("not_found", "The PlugFn connection was not found in the active project identity.");
}

function assertInstallationOwner(installation: PlugFnProviderInstallation, value: PlugFnDomainIdentity): void {
  if (installation.ownerKind === "delegated" && value.organizationId && installation.ownerId === value.organizationId && installation.delegatedToUserId === value.userId) return;
  if (!owns(installation.ownerKind, installation.ownerId, value)) throw new AdminError("not_found", "The PlugFn provider installation was not found in the active project identity.");
}

function assertWorkflowOwner(workflow: Workflow, value: PlugFnDomainIdentity): void {
  if (workflow.userId !== value.userId) throw new AdminError("not_found", "The PlugFn workflow was not found in the active project identity.");
}

function assertWebhookOwner(receipt: PlugFnWebhookReceipt, value: PlugFnDomainIdentity): void {
  if (!owns(receipt.ownerKind, receipt.ownerId, value)) throw new AdminError("not_found", "The PlugFn webhook receipt was not found in the active project identity.");
}

function assertSyncOwner(job: PlugFnSyncJob, value: PlugFnDomainIdentity): void {
  if (!owns(job.ownerKind, job.ownerId, value)) throw new AdminError("not_found", "The PlugFn sync job was not found in the active project identity.");
}

function providerView(provider: Provider, configured: boolean): PlugFnProviderView {
  const capabilities = Object.fromEntries(Object.entries(provider.capabilities ?? {}).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  return {
    id: provider.name, name: provider.name, displayName: provider.displayName, description: provider.description,
    version: provider.version, ...(provider.iconUrl ? { iconUrl: provider.iconUrl } : {}), authType: provider.auth.type, configured,
    actions: Object.keys(provider.actions).sort(), triggers: Object.keys(provider.triggers ?? {}).sort(),
    webhookEvents: [...new Set((provider.webhooks ?? []).flatMap((webhook) => webhook.events ?? []))].sort(),
    syncResources: Object.keys(provider.sync ?? {}).sort(), capabilities,
  };
}

function connectionView(connection: Connection): PlugFnConnectionView {
  return json({
    id: connection.id, provider: connection.provider, ownerKind: connection.ownerKind, ownerId: connection.ownerId,
    name: connection.name, status: connection.status, scopes: connection.scopes, expiresAt: connection.expiresAt,
    connectedAt: connection.connectedAt, lastUsedAt: connection.lastUsedAt, createdAt: connection.createdAt, updatedAt: connection.updatedAt,
    hasCredentials: Boolean(connection.credentials?.encrypted),
  });
}

function installationView(installation: PlugFnProviderInstallation): PlugFnInstallationView {
  return json({ id: installation.id, provider: installation.provider, ownerKind: installation.ownerKind, ownerId: installation.ownerId, status: installation.status, scopes: installation.scopes, createdAt: installation.createdAt, updatedAt: installation.updatedAt });
}

function workflowView(workflow: Workflow): PlugFnWorkflowView {
  return json({
    id: workflow.id, name: workflow.name, description: workflow.description, status: workflow.status,
    trigger: { provider: workflow.definition.trigger.provider, event: workflow.definition.trigger.event },
    steps: workflow.definition.steps.map((step) => ({ id: step.id, type: step.type })), createdAt: workflow.createdAt, updatedAt: workflow.updatedAt,
  });
}

function webhookView(receipt: PlugFnWebhookReceipt): JsonRecord {
  return { ...json({ id: receipt.id, provider: receipt.provider, event: receipt.event, connectionId: receipt.connectionId, ownerKind: receipt.ownerKind, ownerId: receipt.ownerId, payloadHash: receipt.payloadHash, verificationStatus: receipt.verificationStatus, receivedAt: receipt.receivedAt, createdAt: receipt.createdAt }) };
}

function syncView(job: PlugFnSyncJob): JsonRecord {
  return { ...json({ id: job.id, provider: job.provider, connectionId: job.connectionId, resource: job.resource, mode: job.mode, status: job.status, ownerKind: job.ownerKind, ownerId: job.ownerId, fetchedCount: job.fetchedCount, persistedCount: job.persistedCount, skippedCount: job.skippedCount, error: job.error, createdAt: job.createdAt, updatedAt: job.updatedAt }) };
}

async function ownedConnection(options: PlugFnDomainAdminServiceOptions, id: string, context: AdminOperationContext): Promise<{ connection: Connection; identity: PlugFnDomainIdentity }> {
  const mapped = await identity(options, context);
  let connection: Connection;
  try { connection = await options.plugfn.connections.get(id); }
  catch { throw new AdminError("not_found", "The PlugFn connection was not found in the active project identity."); }
  assertConnectionOwner(connection, mapped);
  return { connection, identity: mapped };
}

async function ownedWorkflow(options: PlugFnDomainAdminServiceOptions, id: string, context: AdminOperationContext): Promise<{ workflow: Workflow; identity: PlugFnDomainIdentity }> {
  const mapped = await identity(options, context);
  const workflow = await options.plugfn.workflows.get(id);
  if (!workflow) throw new AdminError("not_found", "The PlugFn workflow was not found in the active project identity.");
  assertWorkflowOwner(workflow, mapped);
  return { workflow, identity: mapped };
}

async function ownedInstallation(options: PlugFnDomainAdminServiceOptions, id: string, context: AdminOperationContext): Promise<PlugFnProviderInstallation> {
  const mapped = await identity(options, context);
  const installation = (await options.plugfn.runtime.installations.list({ id }))[0];
  if (!installation || installation.id !== id) throw new AdminError("not_found", "The PlugFn provider installation was not found in the active project identity.");
  assertInstallationOwner(installation, mapped);
  return installation;
}

async function ownedReceipt(options: PlugFnDomainAdminServiceOptions, id: string, context: AdminOperationContext): Promise<PlugFnWebhookReceipt> {
  const mapped = await identity(options, context);
  const receipt = await options.plugfn.runtime.webhooks.getReceipt(id);
  if (!receipt) throw new AdminError("not_found", "The PlugFn webhook receipt was not found in the active project identity.");
  if (receipt.ownerKind && receipt.ownerId) assertWebhookOwner(receipt, mapped);
  else if (receipt.connectionId) await ownedConnection(options, receipt.connectionId, context);
  else throw new AdminError("not_found", "The PlugFn webhook receipt has no verifiable project owner.");
  return receipt;
}

async function ownedSyncJob(options: PlugFnDomainAdminServiceOptions, id: string, context: AdminOperationContext): Promise<PlugFnSyncJob> {
  const mapped = await identity(options, context);
  const job = await options.plugfn.runtime.sync.getJob(id);
  if (!job) throw new AdminError("not_found", "The PlugFn sync job was not found in the active project identity.");
  if (job.ownerKind && job.ownerId) assertSyncOwner(job, mapped);
  else await ownedConnection(options, job.connectionId, context);
  return job;
}

/**
 * Binds the admin contract only to the public PlugFn facade. Provider secrets,
 * encrypted connection credentials, workflow handlers, webhook metadata, and
 * sync checkpoints are never projected into the administration transport.
 */
export function createPlugFnDomainAdminService(options: PlugFnDomainAdminServiceOptions): PlugFnAdminService {
  if (!options.projectId.trim()) throw new AdminError("invalid_argument", "PlugFn admin binding requires a projectId.");
  return {
    async listProviders(input, context) {
      await identity(options, context);
      const query = input.search?.trim().toLowerCase();
      const values = options.plugfn.providers.list().map((provider) => providerView(provider, Object.hasOwn(options.plugfn.config.integrations, provider.name))).filter((provider) => !query || `${provider.id} ${provider.displayName} ${provider.description}`.toLowerCase().includes(query)).sort((left, right) => left.id.localeCompare(right.id));
      return page(values, input, context);
    },
    async getProvider(input, context) {
      await identity(options, context);
      const provider = options.plugfn.providers.get(input.id);
      if (!provider) throw new AdminError("not_found", "The PlugFn provider was not registered in this project.");
      return { item: providerView(provider, Object.hasOwn(options.plugfn.config.integrations, provider.name)) };
    },
    async listConnections(input, context) {
      const mapped = await identity(options, context);
      const values = await options.plugfn.connections.list({ userId: mapped.userId, provider: input.provider, status: input.status, owner: ownerFor(mapped) });
      return page(values.map(connectionView), input, context);
    },
    async getConnection(input, context) { return { item: connectionView((await ownedConnection(options, input.id, context)).connection) }; },
    async authorizeConnection(input, context) {
      const mapped = await identity(options, context);
      const authUrl = await options.plugfn.connections.getAuthUrl({ ...input, userId: mapped.userId, owner: ownerFor(mapped), actor: mapped });
      return { accepted: true, authUrl };
    },
    async refreshConnection(input, context) {
      const { connection } = await ownedConnection(options, input.id, context);
      return { item: connectionView(await options.plugfn.connections.refresh(connection.id)) };
    },
    async disconnectConnection(input, context) {
      const { connection, identity: mapped } = await ownedConnection(options, input.id, context);
      const result = await options.plugfn.connections.disconnect({ userId: mapped.userId, provider: connection.provider, connectionId: connection.id, owner: ownerFor(mapped), actor: mapped });
      return { accepted: true, disconnected: result.disconnected, remoteRevokeAttempted: result.remoteRevokeAttempted, remoteRevokeSucceeded: result.remoteRevokeSucceeded, localDeleted: result.localDeleted };
    },
    async listInstallations(input, context) {
      const mapped = await identity(options, context);
      const owner = ownerFor(mapped);
      const ownerId = owner.kind === "user" ? owner.userId : owner.organizationId;
      const values = await options.plugfn.runtime.installations.list({ ownerKind: owner.kind, ownerId, ...(input.provider ? { provider: input.provider } : {}), ...(input.status ? { status: input.status } : {}) });
      return page(values.map(installationView), input, context);
    },
    async getInstallation(input, context) { return { item: installationView(await ownedInstallation(options, input.id, context)) }; },
    async disableInstallation(input, context) {
      await ownedInstallation(options, input.id, context);
      return { accepted: true, item: installationView(await options.plugfn.runtime.installations.update(input.id, { status: "disabled" })) };
    },
    async revokeInstallation(input, context) {
      await ownedInstallation(options, input.id, context);
      return { accepted: true, item: installationView(await options.plugfn.runtime.installations.update(input.id, { status: "revoked" })) };
    },
    async listWorkflows(input, context) {
      const mapped = await identity(options, context);
      const listed = await options.plugfn.workflows.list({ userId: mapped.userId, status: input.status });
      const values = input.provider ? listed.filter((workflow) => workflow.definition.trigger.provider === input.provider) : listed;
      return page(values.map(workflowView), input, context);
    },
    async getWorkflow(input, context) { return { item: workflowView((await ownedWorkflow(options, input.id, context)).workflow) }; },
    async getWorkflowStats(input, context) { await ownedWorkflow(options, input.id, context); return { item: { ...json(await options.plugfn.workflows.getStats(input.id)) } }; },
    async enableWorkflow(input, context) { await ownedWorkflow(options, input.id, context); await options.plugfn.workflows.enable(input.id); return { accepted: true }; },
    async disableWorkflow(input, context) { await ownedWorkflow(options, input.id, context); await options.plugfn.workflows.disable(input.id); return { accepted: true }; },
    async deleteWorkflow(input, context) { await ownedWorkflow(options, input.id, context); await options.plugfn.workflows.delete(input.id); return { accepted: true }; },
    async getWebhookReceipt(input, context) { return { item: webhookView(await ownedReceipt(options, input.id, context)) }; },
    async listWebhookDeliveries(input, context) {
      await ownedReceipt(options, input.receiptId, context);
      const values = (await options.plugfn.runtime.webhooks.listDeliveries(input.receiptId)).map((delivery) => ({ ...json({ id: delivery.id, receiptId: delivery.receiptId, sinkId: delivery.sinkId, handlerName: delivery.handlerName, status: delivery.status, attempts: delivery.attempts, nextAttemptAt: delivery.nextAttemptAt, error: delivery.error, createdAt: delivery.createdAt, updatedAt: delivery.updatedAt }) }));
      return page(values, input, context);
    },
    async listSyncJobs(input, context) {
      const mapped = await identity(options, context);
      const owner = ownerFor(mapped);
      const ownerId = owner.kind === "user" ? owner.userId : owner.organizationId;
      const { cursor: _cursor, limit, ...requested } = input;
      const values = await options.plugfn.runtime.sync.listJobs({ ownerKind: owner.kind, ownerId, ...requested }, Math.min(1000, Math.max(limit ?? 50, 100)));
      return page(values.map(syncView), input, context);
    },
    async getSyncJob(input, context) { return { item: syncView(await ownedSyncJob(options, input.id, context)) }; },
    async runSync(input, context) {
      const mapped = await identity(options, context);
      const connection = (await ownedConnection(options, input.connectionId, context)).connection;
      if (connection.provider !== input.provider) throw new AdminError("invalid_argument", "The PlugFn connection does not belong to the requested provider.");
      const { mode, ...run } = input;
      const job = mode === "full" ? await options.plugfn.sync.backfill({ ...run, actor: mapped }) : await options.plugfn.sync.incremental({ ...run, actor: mapped });
      return { accepted: true, item: syncView(job) };
    },
    async enqueueSync(input, context) {
      const mapped = await identity(options, context);
      const connection = (await ownedConnection(options, input.connectionId, context)).connection;
      if (connection.provider !== input.provider) throw new AdminError("invalid_argument", "The PlugFn connection does not belong to the requested provider.");
      return { accepted: true, item: syncView(await options.plugfn.sync.enqueue({ ...input, actor: mapped })) };
    },
    async cancelSync(input, context) {
      const job = await ownedSyncJob(options, input.id, context);
      if (job.status === "completed" || job.status === "failed") throw new AdminError("conflict", `A ${job.status} PlugFn sync job cannot be cancelled.`);
      return { accepted: true, item: syncView(await options.plugfn.runtime.sync.updateJob(input.id, { status: "cancelled" })) };
    },
  };
}
