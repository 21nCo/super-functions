import { describe, expect, it } from "vitest";
import {
  encodeAdminCursor,
  type AdminOperationContext,
} from "@superfunctions/admin";
import {
  apiFnAdminCapability,
  createApiFnAdminAdapter,
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
  it("restricts every operator action to project scope", () => {
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
    expect(first.data.nextCursor).toEqual(expect.any(String));
    expect(second.data.nextCursor).toBeNull();
    await expect(adapter.execute<any>(
      "apifn.specs.list",
      { limit: 1, cursor: first.data.nextCursor },
      context("same-project", "other-workspace"),
    )).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(adapter.execute<any>(
      "apifn.environments.list",
      { cursor: first.data.nextCursor },
      context("same-project"),
    )).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(adapter.execute<any>(
      "apifn.specs.list",
      { cursor: encodeAdminCursor(context("same-project").scope, null) },
      context("same-project"),
    )).rejects.toMatchObject({ code: "invalid_argument", status: 400 });

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

  it("rejects credentials embedded in environment base URLs", async () => {
    const adapter = createApiFnAdminAdapter(createApiFnOperatorService({
      store: new MemoryApiFnOperatorStore(),
    }));

    await expect(adapter.execute("apifn.environments.upsert", {
      id: "production",
      name: "Production",
      baseUrl: "https://operator:secret@example.test/api",
    }, context("project"))).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
