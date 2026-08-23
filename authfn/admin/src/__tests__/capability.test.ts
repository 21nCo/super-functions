import { describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/testing";
import type { AuthFnConfig, AuthFnUserRecord } from "@authfn/core";
import { authFnAdminCapability, createAuthFnAdminAdapter, createAuthFnAdminService } from "../index.js";

const context = {
  scope: { installationId: "install_1", workspaceId: "workspace_1", projectId: "project_1", environmentId: "env_1", namespace: "authfn" },
  actor: { id: "operator_1", permissions: ["*"] }, requestId: "request_1", source: "console" as const,
};

async function setup() {
  const config: AuthFnConfig = { database: memoryAdapter({ debug: false }), namespace: "authfn" };
  await config.database.create<AuthFnUserRecord>({ model: "users", namespace: "authfn", data: { id: "user_1", primaryEmail: "ada@example.com", emailVerifiedAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") } });
  return { config, adapter: createAuthFnAdminAdapter(createAuthFnAdminService(config)) };
}

describe("@authfn/admin capability", () => {
  it("advertises only real user and session operations with typed schemas", () => {
    expect(authFnAdminCapability.operations.map((operation) => operation.id)).toEqual([
      "authfn.users.list", "authfn.users.get", "authfn.users.delete", "authfn.users.list-sessions", "authfn.sessions.revoke",
    ]);
    expect(authFnAdminCapability.operations.find((operation) => operation.id === "authfn.users.delete")).toMatchObject({
      inputSchema: { required: ["id"] }, target: { resource: "users", idInput: "id" },
      safety: { classification: "destructive", requiresConfirmation: true },
    });
    expect(authFnAdminCapability.operations.find((operation) => operation.id === "authfn.users.list-sessions")).toMatchObject({
      target: { resource: "sessions", collection: true },
    });
    expect(authFnAdminCapability.resources?.find((resource) => resource.id === "sessions")?.presentation).toMatchObject({
      standaloneList: false,
      listOperationId: "authfn.users.list-sessions",
      query: { filters: [{ field: "userId", inputPath: "userId" }] },
      parent: { resourceId: "users", bindings: [{ sourceField: "id", queryField: "userId" }] },
    });
  });

  it("reads and deletes through AuthFn core storage", async () => {
    const { config, adapter } = await setup();
    await expect(adapter.invoke("authfn.users.list", {}, context)).resolves.toMatchObject({ data: { items: [{ id: "user_1", primaryEmail: "ada@example.com" }], nextCursor: null } });
    await expect(adapter.invoke("authfn.users.delete", { id: "user_1" }, context)).resolves.toMatchObject({ data: { deleted: true, id: "user_1" } });
    await expect(config.database.findOne({ model: "users", namespace: "authfn", where: [{ field: "id", operator: "eq", value: "user_1" }] })).resolves.toBeNull();
  });

  it("rejects a namespace that is not bound to the AuthFn instance", async () => {
    const { adapter } = await setup();
    await expect(adapter.invoke("authfn.users.list", {}, { ...context, scope: { ...context.scope, namespace: "other" } })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects user cursors reused with a different query", async () => {
    const { config } = await setup();
    await config.database.create<AuthFnUserRecord>({
      model: "users",
      namespace: "authfn",
      data: { id: "user_2", primaryEmail: "grace@example.com", emailVerifiedAt: null, createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02") },
    });
    const service = createAuthFnAdminService(config);
    const first = await service.listUsers({ limit: 1, direction: "asc" }, context);

    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(service.listUsers({ limit: 1, direction: "desc", cursor: first.nextCursor! }, context))
      .rejects.toMatchObject({ code: "AUTHFN_VALIDATION_ERROR" });
    await expect(service.listUsers({ limit: 1, direction: "asc", email: "ada@example.com", cursor: first.nextCursor! }, context))
      .rejects.toMatchObject({ code: "AUTHFN_VALIDATION_ERROR" });
  });
});
