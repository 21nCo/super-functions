import { describe, expect, it } from "vitest";
import {
  AuthType,
  ConnectionStatus,
  MemoryAdapter,
  WorkflowStatus,
  plugFn,
} from "plugfn";
import {
  createPlugFnDomainAdminAdapter,
  plugFnAdminCapability,
} from "../index.js";

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
    const receipt = await runtime.runtime.webhooks.createReceipt({
      provider: "github",
      event: "issues.opened",
      payloadHash: "sha256:abc",
      owner: { kind: "user", userId: "user_1", tenantId: "tenant_1" },
      headersRedacted: { authorization: "should-not-project" },
    });
    await runtime.runtime.webhooks.createDelivery({ receiptId: receipt.id, handlerName: "issues" });

    const list = await adapter.execute("plugfn.provider-installations.list", {}, context);
    expect(list.data).toEqual({ items: [expect.objectContaining({ id: installation.id })], nextCursor: null });
    expect(JSON.stringify(list.data)).not.toContain("never-project-installation-metadata");
    expect(JSON.stringify(list.data)).not.toContain(foreign.id);

    const disabled = await adapter.execute("plugfn.provider-installations.disable", { id: installation.id }, context);
    expect(disabled.data).toEqual({ accepted: true, item: expect.objectContaining({ status: "disabled" }) });

    const deliveries = await adapter.execute("plugfn.webhook-deliveries.list", { receiptId: receipt.id }, context);
    expect(deliveries.data).toEqual({ items: [expect.objectContaining({ receiptId: receipt.id, status: "pending" })], nextCursor: null });
    expect(JSON.stringify(deliveries.data)).not.toContain("should-not-project");
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
    await database.createWorkflow({
      id: "workflow_1", userId: "user_1", name: "Issue workflow", status: WorkflowStatus.Disabled,
      definition: { trigger: { provider: "github", event: "issues.opened" }, steps: [] }, createdAt: now, updatedAt: now,
    });

    const connection = await adapter.execute("plugfn.connections.get", { id: "connection_1" }, context);
    expect(connection.data).toEqual({ item: expect.objectContaining({ id: "connection_1", hasCredentials: true }) });
    expect(JSON.stringify(connection.data)).not.toContain("ciphertext");
    await expect(adapter.execute("plugfn.connections.get", { id: "foreign_connection" }, context)).rejects.toMatchObject({ code: "not_found" });

    const enabled = await adapter.execute("plugfn.workflows.enable", { id: "workflow_1" }, context);
    expect(enabled.data).toEqual({ accepted: true });
    expect((await runtime.workflows.get("workflow_1"))?.status).toBe(WorkflowStatus.Enabled);

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
});
