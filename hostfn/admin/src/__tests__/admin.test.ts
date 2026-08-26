import {
  createAdminClient,
  validateAdminCapabilityManifest,
} from "@superfunctions/admin";
import {
  HostFnOperatorService,
  MemoryHostFnOperatorStore,
  type HostFnDeploymentExecutor,
  type HostFnScope,
  type HostFnTarget,
} from "hostfn/operator";
import { describe, expect, it, vi } from "vitest";
import {
  createHostFnAdminAdapter,
  createHostFnAdminClient,
  createHostFnOperatorAdminService,
  hostFnAdminCapability,
} from "../index.js";

const scope: HostFnScope = {
  installationId: "installation_1",
  workspaceId: "workspace_1",
  projectId: "project_1",
  environmentId: "production",
};
const context = {
  scope,
  actor: { id: "operator_1", permissions: ["*"] },
  requestId: "request_1",
  correlationId: "correlation_1",
  source: "console" as const,
  idempotencyKey: "idem_1",
  confirmationToken: "confirmed",
};
function executor(): HostFnDeploymentExecutor {
  return {
    deploy: vi.fn(),
    cancel: vi.fn(),
    rollback: vi.fn(),
    restart: vi.fn(),
    attachDomain: vi.fn(),
    detachDomain: vi.fn(),
    setVariable: vi.fn(),
    deleteVariable: vi.fn(),
  };
}

describe("@hostfn/admin", () => {
  it("publishes a usable required product manifest", () => {
    expect(validateAdminCapabilityManifest(hostFnAdminCapability)).toEqual([]);
    expect(hostFnAdminCapability.availability).toBe("required-product");
    expect(hostFnAdminCapability.resources.map((item) => item.id)).toEqual([
      "targets",
      "deployments",
      "domains",
      "variables",
    ]);
    expect(hostFnAdminCapability.operations).toHaveLength(14);
    expect(
      hostFnAdminCapability.operations.find(
        (item) => item.id === "hostfn.variables.set",
      ),
    ).toMatchObject({
      minimumScope: "environment",
      safety: { audit: "required", requiresConfirmation: true },
      redaction: { inputFields: ["value"] },
    });
  });

  it("binds deployments, domains, and secret writes to the injected HostFn executor", async () => {
    const store = new MemoryHostFnOperatorStore();
    const boundary = executor();
    const target: HostFnTarget = {
      id: "target_1",
      scope,
      name: "api",
      server: "deploy@example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    await store.putTarget(target);
    const adapter = createHostFnAdminAdapter(
      createHostFnOperatorAdminService(
        new HostFnOperatorService(store, boundary),
      ),
    );
    const deployed = await adapter.invoke<{ item: { id: string } }>(
      "hostfn.deployments.deploy",
      { targetId: target.id, revision: "git:abc123" },
      context,
    );
    await adapter.invoke(
      "hostfn.domains.attach",
      { targetId: target.id, hostname: "api.example.test" },
      context,
    );
    await adapter.invoke(
      "hostfn.variables.set",
      { targetId: target.id, key: "DATABASE_URL", value: "postgres://secret" },
      context,
    );
    expect(deployed.data.item.id).toMatch(/^deployment_/);
    expect(boundary.deploy).toHaveBeenCalled();
    expect(boundary.attachDomain).toHaveBeenCalled();
    expect(boundary.setVariable).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "DATABASE_URL",
        value: "postgres://secret",
      }),
    );
    await expect(
      adapter.invoke("hostfn.variables.list", {}, context),
    ).resolves.toMatchObject({ data: { items: [{ key: "DATABASE_URL" }] } });
    expect(
      JSON.stringify(
        (await adapter.invoke("hostfn.variables.list", {}, context)).data,
      ),
    ).not.toContain("postgres://secret");
  });

  it("isolates identical target ids across the complete active scope", async () => {
    const store = new MemoryHostFnOperatorStore();
    const other = { ...scope, environmentId: "staging" };
    await store.putTarget({
      id: "target_1",
      scope,
      name: "prod",
      server: "prod",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "now",
    });
    await store.putTarget({
      id: "target_1",
      scope: other,
      name: "stage",
      server: "stage",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "now",
    });
    const adapter = createHostFnAdminAdapter(
      createHostFnOperatorAdminService(
        new HostFnOperatorService(store, executor()),
      ),
    );
    await expect(
      adapter.invoke("hostfn.targets.get", { id: "target_1" }, context),
    ).resolves.toMatchObject({ data: { item: { name: "prod" } } });
    await expect(
      adapter.invoke(
        "hostfn.targets.get",
        { id: "target_1" },
        { ...context, scope: other },
      ),
    ).resolves.toMatchObject({ data: { item: { name: "stage" } } });
  });

  it("paginates deterministically and rejects a cursor in another scope", async () => {
    class ReorderingStore extends MemoryHostFnOperatorStore {
      private reversed = false;
      override async listTargets(activeScope: HostFnScope) {
        const values = await super.listTargets(activeScope);
        this.reversed = !this.reversed;
        return this.reversed ? values.reverse() : values;
      }
    }
    const store = new ReorderingStore();
    for (let index = 0; index < 3; index++)
      await store.putTarget({
        id: `target_${index}`,
        scope,
        name: `target ${index}`,
        server: "server",
        runtime: "nodejs",
        status: "ready",
        updatedAt: "now",
      });
    const adapter = createHostFnAdminAdapter(
      createHostFnOperatorAdminService(
        new HostFnOperatorService(store, executor()),
      ),
    );
    expect(Object.keys(adapter.handlers).sort()).toEqual(
      hostFnAdminCapability.operations.map((item) => item.id).sort(),
    );
    const first = await adapter.invoke<{
      items: unknown[];
      nextCursor: string;
    }>("hostfn.targets.list", { limit: 2 }, context);
    expect(first.data.items).toEqual([
      expect.objectContaining({ id: "target_0" }),
      expect.objectContaining({ id: "target_1" }),
    ]);
    const second = await adapter.invoke<{ items: unknown[]; nextCursor: null }>(
      "hostfn.targets.list",
      { limit: 2, cursor: first.data.nextCursor },
      context,
    );
    expect(second.data.items).toEqual([expect.objectContaining({ id: "target_2" })]);
    expect(second.data.nextCursor).toBeNull();
    await expect(
      adapter.invoke<{ items: unknown[] }>(
        "hostfn.targets.list",
        { limit: 2, cursor: first.data.nextCursor },
        {
          ...context,
          scope: {
            organizationId: scope.installationId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            namespace: "ignored-by-hostfn",
          },
        },
      ),
    ).resolves.toMatchObject({ data: { items: expect.any(Array) } });
    await expect(
      adapter.invoke(
        "hostfn.targets.list",
        { cursor: first.data.nextCursor },
        { ...context, scope: { ...scope, environmentId: "staging" } },
      ),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(
      adapter.invoke(
        "hostfn.deployments.list",
        { cursor: first.data.nextCursor },
        context,
      ),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(
      adapter.invoke(
        "hostfn.targets.list",
        { status: "failed", cursor: first.data.nextCursor },
        context,
      ),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("round-trips cursors for Unicode scope identifiers", async () => {
    const unicodeScope: HostFnScope = {
      ...scope,
      projectId: "project_日本_🚀",
    };
    const store = new MemoryHostFnOperatorStore();
    for (let index = 0; index < 2; index++)
      await store.putTarget({
        id: `unicode_target_${index}`,
        scope: unicodeScope,
        name: `target ${index}`,
        server: "server",
        runtime: "nodejs",
        status: "ready",
        updatedAt: "now",
      });
    const adapter = createHostFnAdminAdapter(
      createHostFnOperatorAdminService(
        new HostFnOperatorService(store, executor()),
      ),
    );
    const unicodeContext = { ...context, scope: unicodeScope };
    const first = await adapter.invoke<{
      items: unknown[];
      nextCursor: string;
    }>("hostfn.targets.list", { limit: 1 }, unicodeContext);
    await expect(
      adapter.invoke(
        "hostfn.targets.list",
        { limit: 1, cursor: first.data.nextCursor },
        unicodeContext,
      ),
    ).resolves.toMatchObject({
      data: { items: [expect.any(Object)], nextCursor: null },
    });
  });

  it("preserves the common capability client contract alongside named methods", () => {
    const client = createHostFnAdminClient(
      createAdminClient({
        baseUrl: "http://admin.test",
        fetch: vi.fn() as never,
      }),
    );
    expect(client).toMatchObject({
      manifest: hostFnAdminCapability,
      operations: expect.any(Object),
      availability: expect.any(Function),
      invoke: expect.any(Function),
      pages: expect.any(Function),
      deployments: { deploy: expect.any(Function) },
    });
    expect("execute" in client).toBe(false);
  });
});
