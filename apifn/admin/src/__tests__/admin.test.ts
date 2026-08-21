import { describe, expect, it, vi } from "vitest";
import {
  createAdminClient,
  validateAdminCapabilityManifest,
  type AdminOperationContext,
} from "@superfunctions/admin";
import {
  apiFnAdminCapability,
  createApiFnAdminAdapter,
  createApiFnAdminClient,
  createApiFnOperatorService,
  MemoryApiFnOperatorStore,
} from "../index.js";

const document = {
  openapi: "3.1.0",
  info: { title: "Tasks", version: "1.0.0" },
  paths: { "/tasks": { get: { responses: { "200": { description: "OK" } } } } },
};
function context(
  projectId: string,
  workspaceId = "workspace",
  environmentId?: string,
): AdminOperationContext {
  return {
    scope: { installationId: "installation", workspaceId, projectId, environmentId },
    actor: { id: "operator", permissions: ["*"] },
    requestId: crypto.randomUUID(),
    source: "console",
    idempotencyKey: crypto.randomUUID(),
  };
}

function legacyContext(projectId: string): AdminOperationContext {
  return { ...context(projectId), scope: { organizationId: "installation", workspaceId: "workspace", projectId } };
}

describe("@apifn/admin", () => {
  it("publishes a valid optional exact operator surface", () => {
    expect(validateAdminCapabilityManifest(apiFnAdminCapability)).toEqual([]);
    expect(apiFnAdminCapability.availability).toBe("optional-product");
    expect(apiFnAdminCapability.operations).toHaveLength(9);
    expect(apiFnAdminCapability.operations.every((operation) => operation.minimumScope === "project")).toBe(true);
  });

  it("validates, persists, diffs, paginates, and isolates the full scope", async () => {
    const adapter = createApiFnAdminAdapter(createApiFnOperatorService({
      store: new MemoryApiFnOperatorStore(),
    }));
    expect(Object.keys(adapter.handlers)).toHaveLength(9);
    await adapter.execute("apifn.specs.register", { id: "tasks", name: "Tasks", document }, context("same-project"));
    await adapter.execute("apifn.specs.register", { id: "accounts", name: "Accounts", document }, context("same-project"));

    const first = await adapter.execute<any>("apifn.specs.list", { limit: 1 }, context("same-project"));
    const second = await adapter.execute<any>(
      "apifn.specs.list",
      { limit: 1, cursor: first.data.nextCursor },
      context("same-project"),
    );
    expect(first.data.items).toHaveLength(1);
    expect(first.data.nextCursor).toBe("1");
    expect(second.data.nextCursor).toBeNull();

    const otherWorkspace = await adapter.execute<any>(
      "apifn.specs.list",
      {},
      context("same-project", "other-workspace"),
    );
    const otherEnvironment = await adapter.execute<any>(
      "apifn.specs.list",
      {},
      context("same-project", "workspace", "production"),
    );
    expect(otherWorkspace.data.items).toEqual([]);
    expect(otherEnvironment.data.items).toEqual([]);
    expect((await adapter.execute<any>("apifn.specs.list", {}, legacyContext("same-project"))).data.items).toHaveLength(2);

    const compared = await adapter.execute<any>(
      "apifn.specs.compare",
      { id: "tasks", candidate: { ...document, paths: {} } },
      context("same-project"),
    );
    expect(compared.data.item.hasBreakingChanges).toBe(true);
    expect(compared.data.item.breaking[0]).not.toHaveProperty("before");
  });

  it("offers named typed methods and common capability methods", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { items: [], nextCursor: null },
    }), { status: 200 }));
    const client = createApiFnAdminClient(createAdminClient({
      baseUrl: "https://example.test/admin",
      fetch: fetcher as typeof fetch,
    }));
    await client.specs.list();
    expect(String(fetcher.mock.calls[0]![0])).toContain("apifn.specs.list");
    expect(client.environments.upsert).toEqual(expect.any(Function));
    expect(client.availability).toEqual(expect.any(Function));
  });
});
