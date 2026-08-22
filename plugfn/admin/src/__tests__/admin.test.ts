import { describe, expect, it, vi } from "vitest";
import {
  AuthType,
  ConnectionStatus,
  MemoryAdapter,
  WorkflowStatus,
  plugFn,
} from "plugfn";
import {
  createPlugFnDomainAdminAdapter,
  createPlugFnDomainAdminService,
  plugFnAdminCapability,
} from "../index.js";
import { encodeAdminCursor } from "@superfunctions/admin";

const context = {
  scope: {
    installationId: "install_1",
    workspaceId: "workspace_1",
    projectId: "project_1",
    environmentId: "environment_1",
    namespace: "tenant_1",
    region: "in-south",
  },
  actor: { id: "operator_1", type: "user" as const, permissions: ["*"] },
  requestId: "request_1",
  correlationId: "correlation_1",
  source: "console" as const,
  idempotencyKey: "idempotency_1",
};

function setup() {
  const database = new MemoryAdapter();
  const runtime = plugFn({
    database,
    auth: { async authenticate() { return { userId: "user_1" }; } },
    baseUrl: "https://console.example.test",
    encryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    integrations: { github: { type: "api-key", apiKey: "never-project-this-secret" } },
  });
  runtime.providers.register({
    name: "github", displayName: "GitHub", version: "1.0.0", description: "GitHub provider", baseUrl: "https://api.github.test",
    auth: { type: AuthType.ApiKey, config: { headerName: "authorization" } },
    actions: {},
    capabilities: { actions: true, sync: false },
  });
  const adapter = createPlugFnDomainAdminAdapter({
    plugfn: runtime,
    projectId: "project_1",
    identity: () => ({ userId: "user_1", tenantId: "tenant_1" }),
  });
  return { adapter, database, runtime };
}

describe("@plugfn/admin", () => {
  it("advertises only operations backed by PlugFn's public facade", () => {
    expect(plugFnAdminCapability.scopeLevels).toEqual(["installation", "workspace", "project", "environment"]);
    expect(plugFnAdminCapability.operations.map((operation) => operation.id)).toEqual([
      "plugfn.providers.list", "plugfn.providers.get",
      "plugfn.connections.list", "plugfn.connections.get", "plugfn.connections.authorize", "plugfn.connections.refresh", "plugfn.connections.disconnect",
      "plugfn.provider-installations.list", "plugfn.provider-installations.get", "plugfn.provider-installations.disable", "plugfn.provider-installations.revoke",
      "plugfn.workflows.list", "plugfn.workflows.get", "plugfn.workflows.stats", "plugfn.workflows.enable", "plugfn.workflows.disable", "plugfn.workflows.delete",
      "plugfn.webhook-receipts.get", "plugfn.webhook-deliveries.list",
      "plugfn.sync-jobs.list", "plugfn.sync-jobs.get", "plugfn.sync-jobs.run", "plugfn.sync-jobs.enqueue", "plugfn.sync-jobs.cancel",
    ]);
    expect(plugFnAdminCapability.operations.every((operation) => operation.minimumScope === "project")).toBe(true);
    expect(plugFnAdminCapability.operations.find((operation) => operation.id === "plugfn.connections.disconnect")?.safety.confirmation).toMatchObject({ risk: "critical", method: "mfa" });
    expect(plugFnAdminCapability.operations.some((operation) => operation.id.includes("credentials") || operation.id.includes("replay"))).toBe(false);
  });

  it("projects a real registered provider without leaking configured secrets", async () => {
    const { adapter } = setup();
    const result = await adapter.execute("plugfn.providers.get", { id: "github" }, context);
    expect(result.data).toEqual({
      item: expect.objectContaining({ id: "github", displayName: "GitHub", configured: true, actions: [] }),
    });
    expect(JSON.stringify(result.data)).not.toContain("never-project-this-secret");
  });

  it("uses PlugFn runtime persistence for scoped installation and webhook administration", async () => {
    const { adapter, runtime } = setup();
    const installation = await runtime.runtime.installations.create({
      provider: "github",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_1" },
      scopes: ["repo"],
      metadata: { secret: "never-project-installation-metadata" },
    });
    const foreign = await runtime.runtime.installations.create({
      provider: "github",
      owner: { kind: "user", userId: "other_user" },
    });
    const foreignTenant = await runtime.runtime.installations.create({
      provider: "github",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_2" },
    });
    const receipt = await runtime.runtime.webhooks.createReceipt({
      provider: "github",
      event: "issues.opened",
      payloadHash: "sha256:abc",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_1" },
      headersRedacted: { authorization: "should-not-project" },
    });
    const foreignTenantReceipt = await runtime.runtime.webhooks.createReceipt({
      provider: "github",
      event: "issues.opened",
      payloadHash: "sha256:foreign-tenant",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_2" },
    });
    const tenantlessReceipt = await runtime.runtime.webhooks.createReceipt({
      provider: "github",
      event: "issues.opened",
      payloadHash: "sha256:tenantless",
      owner: { kind: "user", userId: "user_1" },
    });
    await runtime.runtime.webhooks.createDelivery({ receiptId: receipt.id, handlerName: "issues" });

    const list = await adapter.execute("plugfn.provider-installations.list", {}, context);
    expect(list.data).toEqual({ items: [expect.objectContaining({ id: installation.id })], nextCursor: null });
    expect(JSON.stringify(list.data)).not.toContain("never-project-installation-metadata");
    expect(JSON.stringify(list.data)).not.toContain(foreign.id);
    expect(JSON.stringify(list.data)).not.toContain(foreignTenant.id);

    const disabled = await adapter.execute("plugfn.provider-installations.disable", { id: installation.id }, context);
    expect(disabled.data).toEqual({ accepted: true, item: expect.objectContaining({ status: "disabled" }) });

    const deliveries = await adapter.execute("plugfn.webhook-deliveries.list", { receiptId: receipt.id }, context);
    expect(deliveries.data).toEqual({ items: [expect.objectContaining({ receiptId: receipt.id, status: "pending" })], nextCursor: null });
    expect(JSON.stringify(deliveries.data)).not.toContain("should-not-project");
    await expect(adapter.execute("plugfn.webhook-receipts.get", { id: foreignTenantReceipt.id }, context)).rejects.toMatchObject({ code: "not_found" });
    await expect(adapter.execute("plugfn.webhook-receipts.get", { id: tenantlessReceipt.id }, context)).rejects.toMatchObject({ code: "not_found" });
  });

  it("enforces mapped ownership before connection, workflow, and sync mutation", async () => {
    const { adapter, database, runtime } = setup();
    const now = new Date();
    await database.createConnection({
      id: "connection_1", userId: "user_1", provider: "github", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_1",
      status: ConnectionStatus.Active, credentials: { encrypted: "ciphertext", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createConnection({
      id: "foreign_connection", userId: "other_user", provider: "github", ownerKind: "user", ownerId: "other_user",
      status: ConnectionStatus.Active, credentials: { encrypted: "foreign-ciphertext", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createConnection({
      id: "foreign_tenant_connection", userId: "user_1", provider: "github", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_2",
      status: ConnectionStatus.Active, credentials: { encrypted: "foreign-tenant-ciphertext", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createWorkflow({
      id: "workflow_1", userId: "user_1", name: "Issue workflow", status: WorkflowStatus.Disabled,
      tenantId: "tenant_1", definition: { trigger: { provider: "github", event: "issues.opened" }, steps: [] }, metadata: { tenantId: "caller-forged-tenant" }, createdAt: now, updatedAt: now,
    });
    await database.createWorkflow({
      id: "foreign_tenant_workflow", userId: "user_1", name: "Foreign tenant workflow", status: WorkflowStatus.Disabled,
      tenantId: "tenant_2", definition: { trigger: { provider: "github", event: "issues.opened" }, steps: [] }, metadata: { tenantId: "tenant_1" }, createdAt: now, updatedAt: now,
    });
    await database.createWorkflow({
      id: "legacy_workflow", userId: "user_1", name: "Legacy workflow", status: WorkflowStatus.Disabled,
      definition: { trigger: { provider: "github", event: "issues.opened" }, steps: [] }, createdAt: now, updatedAt: now,
    });

    const connection = await adapter.execute("plugfn.connections.get", { id: "connection_1" }, context);
    expect(connection.data).toEqual({ item: expect.objectContaining({ id: "connection_1", hasCredentials: true }) });
    expect(JSON.stringify(connection.data)).not.toContain("ciphertext");
    await expect(adapter.execute("plugfn.connections.get", { id: "foreign_connection" }, context)).rejects.toMatchObject({ code: "not_found" });
    await expect(adapter.execute("plugfn.connections.get", { id: "foreign_tenant_connection" }, context)).rejects.toMatchObject({ code: "not_found" });

    const enabled = await adapter.execute("plugfn.workflows.enable", { id: "workflow_1" }, context);
    expect(enabled.data).toEqual({ accepted: true });
    expect((await runtime.workflows.get("workflow_1"))?.status).toBe(WorkflowStatus.Enabled);
    const workflows = await adapter.execute("plugfn.workflows.list", {}, context);
    expect(workflows.data).toEqual({ items: [expect.objectContaining({ id: "workflow_1" })], nextCursor: null });
    await expect(adapter.execute("plugfn.workflows.get", { id: "foreign_tenant_workflow" }, context)).rejects.toMatchObject({ code: "not_found" });
    await expect(adapter.execute("plugfn.workflows.get", { id: "legacy_workflow" }, context)).rejects.toMatchObject({ code: "not_found" });

    const queued = await adapter.execute("plugfn.sync-jobs.enqueue", { provider: "github", connectionId: "connection_1", resource: "issues", mode: "full" }, context);
    const jobId = (queued.data as { item: { id: string } }).item.id;
    expect(queued.data).toEqual({ accepted: true, item: expect.objectContaining({ status: "queued", ownerId: "user_1" }) });
    const cancelled = await adapter.execute("plugfn.sync-jobs.cancel", { id: jobId }, context);
    expect(cancelled.data).toEqual({ accepted: true, item: expect.objectContaining({ status: "cancelled" }) });
  });

  it("rejects a facade bound to another project", async () => {
    const { adapter } = setup();
    await expect(adapter.execute("plugfn.providers.list", {}, { ...context, scope: { ...context.scope, projectId: "other_project" } })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("fetches enough sync jobs to serve cursor pages beyond the first hundred", async () => {
    const jobs = Array.from({ length: 151 }, (_, index) => ({
      id: `job_${index}`, provider: "github", connectionId: "connection_1", resource: "issues", mode: "full",
      status: "queued", ownerKind: "user", ownerId: "user_1", fetchedCount: 0, persistedCount: 0, skippedCount: 0,
      createdAt: new Date(index), updatedAt: new Date(index),
    }));
    const listJobs = vi.fn(async (_filters, limit: number, offset = 0) => jobs.slice(offset, offset + limit));
    const service = createPlugFnDomainAdminService({
      plugfn: {
        connections: { get: async () => ({ userId: "user_1", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_1" }) },
        runtime: { sync: { listJobs } },
      } as never,
      projectId: "project_1",
      identity: () => ({ userId: "user_1", tenantId: "tenant_1" }),
    });
    const first = await service.listSyncJobs({ limit: 100 }, context);
    const second = await service.listSyncJobs({ limit: 100, cursor: first.nextCursor! }, context);
    expect(second.items).toHaveLength(51);
    expect(second.items[0]).toMatchObject({ id: "job_100" });
    expect(listJobs).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: "user_1" }), 101, 100);

    const forgedOffset = Number.MAX_SAFE_INTEGER;
    await service.listSyncJobs({ limit: 100, cursor: encodeAdminCursor(context.scope, { offset: forgedOffset }) }, context);
    expect(listJobs).toHaveBeenLastCalledWith(expect.any(Object), 101, forgedOffset);
  });

  it("filters sync-job lists by tenant as well as owner", async () => {
    const { adapter, database, runtime } = setup();
    const now = new Date();
    await database.createConnection({
      id: "connection_1", userId: "user_1", provider: "github", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_1",
      status: ConnectionStatus.Active, credentials: { encrypted: "owned", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createConnection({
      id: "connection_2", userId: "user_1", provider: "github", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_2",
      status: ConnectionStatus.Active, credentials: { encrypted: "foreign-tenant", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createConnection({
      id: "connection_3", userId: "other_user", provider: "github", ownerKind: "user", ownerId: "other_user", tenantId: "tenant_1",
      status: ConnectionStatus.Active, credentials: { encrypted: "foreign-owner", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    await database.createConnection({
      id: "connection_4", userId: "user_1", provider: "github", ownerKind: "user", ownerId: "user_1",
      status: ConnectionStatus.Active, credentials: { encrypted: "tenantless", algorithm: "aes-256-gcm" }, connectedAt: now, createdAt: now, updatedAt: now,
    });
    const owned = await runtime.runtime.sync.createJob({
      provider: "github", connectionId: "connection_1", resource: "issues", mode: "full",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_1" },
    });
    const foreignTenant = await runtime.runtime.sync.createJob({
      provider: "github", connectionId: "connection_2", resource: "issues", mode: "full",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_2" },
    });
    const foreignOwner = await runtime.runtime.sync.createJob({
      provider: "github", connectionId: "connection_3", resource: "issues", mode: "full",
      owner: { kind: "user", userId: "other_user", tenantId: "tenant_1" },
    });
    const tenantless = await runtime.runtime.sync.createJob({
      provider: "github", connectionId: "connection_4", resource: "issues", mode: "full",
      owner: { kind: "user", userId: "user_1" },
    });

    const result = await adapter.execute("plugfn.sync-jobs.list", {}, context);
    expect(result.data).toEqual({ items: [expect.objectContaining({ id: owned.id })], nextCursor: null });
    expect(JSON.stringify(result.data)).not.toContain(foreignTenant.id);
    expect(JSON.stringify(result.data)).not.toContain(foreignOwner.id);
    expect(JSON.stringify(result.data)).not.toContain(tenantless.id);

    const tenantlessAdapter = createPlugFnDomainAdminAdapter({
      plugfn: runtime,
      projectId: "project_1",
      identity: () => ({ userId: "user_1" }),
    });
    const tenantlessResult = await tenantlessAdapter.execute("plugfn.sync-jobs.list", {}, context);
    expect(tenantlessResult.data).toEqual({ items: [expect.objectContaining({ id: tenantless.id })], nextCursor: null });
    expect(JSON.stringify(tenantlessResult.data)).not.toContain(owned.id);
  });

  it("bounds tenant filtering work and reuses connection ownership checks", async () => {
    const jobs = Array.from({ length: 50 }, (_, index) => ({
      id: `foreign_job_${index}`, provider: "github", connectionId: "foreign_connection", resource: "issues", mode: "full",
      status: "queued", ownerKind: "user", ownerId: "user_1", fetchedCount: 0, persistedCount: 0, skippedCount: 0,
      createdAt: new Date(index), updatedAt: new Date(index),
    }));
    const listJobs = vi.fn(async (_filters, limit: number, offset = 0) => jobs.slice(offset, offset + limit));
    const getConnection = vi.fn(async () => ({
      userId: "user_1", ownerKind: "user", ownerId: "user_1", tenantId: "tenant_2",
    }));
    const service = createPlugFnDomainAdminService({
      plugfn: { connections: { get: getConnection }, runtime: { sync: { listJobs } } } as never,
      projectId: "project_1",
      identity: () => ({ userId: "user_1", tenantId: "tenant_1" }),
    });

    const result = await service.listSyncJobs({ limit: 1 }, context);

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(listJobs).toHaveBeenCalledTimes(4);
    expect(getConnection).toHaveBeenCalledTimes(1);
  });
});
