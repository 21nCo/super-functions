import { describe, expect, it, vi } from "vitest";
import {
  dataFnAdminCapability,
  createDataFnAdminClient,
  createDataFnAdminAdapter,
  createDataFnDomainAdminService,
} from "../index.js";
import { createAdminClient, validateAdminCapabilityManifest } from "@superfunctions/admin";
import { createDatafnServer } from "@datafn/server";
import type { DatafnExecutor } from "@datafn/server";
import { memoryAdapter } from "@superfunctions/db/adapters";

const context = {
  scope: {
    organizationId: "org_1",
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

describe("@datafn/admin", () => {
  it("declares the inventoried operator surface and mutation policy", () => {
    expect(validateAdminCapabilityManifest(dataFnAdminCapability)).toEqual([]);
    expect(dataFnAdminCapability.schemaVersion).toBe("1.0");
    expect(dataFnAdminCapability.availability).toBe("required-product");
    expect(dataFnAdminCapability.scopeLevels).toEqual([
      "organization",
      "workspace",
      "project",
      "environment",
    ]);
    expect(
      dataFnAdminCapability.operations.some(
        (operation) => operation.id === "datafn.schemas.list",
      ),
    ).toBe(true);
    expect(dataFnAdminCapability.operations).toHaveLength(15);
    const mutation = dataFnAdminCapability.operations.find(
      (operation) => operation.safety.classification !== "read",
    );
    expect(mutation).toMatchObject({
      safety: {
        audit: "required",
        idempotent: true,
      },
    });
    expect(dataFnAdminCapability.operations.find(
      (operation) => operation.id === "datafn.queries.query",
    )).toMatchObject({
      safety: { classification: "read", idempotent: true },
      mcp: { readOnlyHint: true },
      target: { resource: "queries", collection: true },
    });
    expect(dataFnAdminCapability.resources?.map((resource) => resource.id)).toContain("queries");
    expect(dataFnAdminCapability.operations.some(
      (operation) => operation.id === "datafn.queries.list",
    )).toBe(false);
    const schemaList = dataFnAdminCapability.operations.find(
      (operation) => operation.id === "datafn.schemas.list",
    );
    expect(schemaList?.inputSchema?.properties).toEqual({
      cursor: expect.any(Object),
      limit: expect.any(Object),
    });
    const recordList = dataFnAdminCapability.operations.find(
      (operation) => operation.id === "datafn.records.list",
    );
    expect(recordList?.inputSchema).toMatchObject({
      required: ["filter"],
      properties: { filter: { required: ["resource"] } },
    });
    expect(dataFnAdminCapability.resources?.find(
      (resource) => resource.id === "records",
    )?.presentation).toMatchObject({
      standaloneList: false,
      listOperationId: "datafn.records.list",
      query: {
        filters: [{ field: "resource", inputPath: "filter.resource" }],
      },
      parent: {
        resourceId: "resources",
        bindings: [{ sourceField: "name", queryField: "resource" }],
      },
    });
    const mutationOperation = dataFnAdminCapability.operations.find(
      (operation) => operation.id === "datafn.records.mutate",
    );
    expect(mutationOperation?.inputSchema).toMatchObject({
      required: ["id", "payload"],
      additionalProperties: false,
    });
  });

  it("provides named typed client methods for every real resource family", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { items: [], nextCursor: null },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createDataFnAdminClient(createAdminClient({
      baseUrl: "https://console.example.test/api/admin/v1",
      fetch: fetcher as typeof fetch,
    }));

    await client.schemas.list({ limit: 25 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("/operations/datafn.schemas.list");
    expect(JSON.parse(String(request?.body))).toEqual({ limit: 25 });
    expect(client.records).toEqual(expect.objectContaining({
      list: expect.any(Function),
      get: expect.any(Function),
      mutate: expect.any(Function),
      transact: expect.any(Function),
    }));
    expect(client.queries.query).toEqual(expect.any(Function));
  });

  it("assigns distinct addressable IDs to relations with the same endpoints", async () => {
    const executor = {
      schema: {
        version: 1,
        namespaced: true,
        resources: [],
        relations: [
          { from: "users", to: "teams", type: "many-to-many", relation: "memberships", inverse: "members" },
          { from: "users", to: "teams", type: "many-to-many", relation: "ownerships", inverse: "owners" },
        ],
      },
    } as unknown as DatafnExecutor<{ namespace: string }>;
    const service = createDataFnDomainAdminService({
      executor,
      context: () => ({ namespace: "tenant_1" }),
    });

    const listed = await service.listRelations({}, context);
    const items = listed.data.items;
    expect(items.map((item) => item.id)).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    await expect(service.getRelation({ id: items[1]!.id }, context)).resolves.toMatchObject({
      data: { item: { relation: "ownerships", inverse: "owners" } },
    });
  });

  it("binds schema, mutation, and record reads through the real DataFn executor", async () => {
    const server = await createDatafnServer<{ namespace: string; actorId: string }>({
      schema: {
        resources: [{
          name: "tasks",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
          permissions: {
            read: { fields: ["title"] },
            write: { fields: ["title"] },
          },
        }],
      },
      db: memoryAdapter(),
      namespaceProvider: {
        getNamespace: (value) => value.namespace,
        getActorId: (value) => value.actorId,
      },
    });
    const service = createDataFnDomainAdminService({
        executor: server.executor,
        context: (admin) => ({
          namespace: admin.scope.namespace ?? admin.scope.projectId ?? "datafn",
          actorId: admin.actor.id,
        }),
      });
    const mutate = vi.spyOn(service, "mutate");
    const adapter = createDataFnAdminAdapter(service);
    expect(Object.keys(adapter.handlers).sort()).toEqual(
      dataFnAdminCapability.operations.map((operation) => operation.id).sort(),
    );
    await adapter.execute("datafn.records.mutate", {
      id: "tasks:task-1",
      payload: {
        resource: "tasks",
        version: "1",
        operation: "insert",
        clientId: "superconsole",
        mutationId: "create-task-1",
        id: "task-1",
        record: { title: "Ship Super Console" },
      },
    }, context);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: "tasks:task-1",
    }), context);
    expect(service).not.toHaveProperty("execute");
    await expect(adapter.execute("datafn.records.mutate", {
      id: "tasks:another-task",
      payload: {
        resource: "tasks",
        version: "1",
        operation: "insert",
        clientId: "superconsole",
        mutationId: "mismatched-target",
        id: "task-2",
        record: { title: "Must not run" },
      },
    }, context)).rejects.toMatchObject({ code: "invalid_argument" });

    const records = await adapter.execute("datafn.records.list", {
      limit: 10,
      filter: { resource: "tasks", select: ["title"] },
    }, context);
    expect(records.data).toMatchObject({
      items: [{ id: "tasks:task-1", title: "Ship Super Console" }],
    });
    const resources = await adapter.execute("datafn.resources.list", {}, context);
    expect(resources.data).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: "tasks", version: 1 })]),
    });
    await server.close();
  });

  it("translates and binds opaque admin cursors to the DataFn record collection", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: "task-1", recordId: "linked-record" }], nextCursor: { createdAt: "2026-08-15", id: "task-1" } })
      .mockResolvedValueOnce({ data: [{ id: "task-2" }], nextCursor: null });
    const executor = {
      schema: { version: 1, resources: [{ name: "tasks", version: 1 }, { name: "other", version: 1 }] },
      query,
    } as unknown as DatafnExecutor<{ namespace: string }>;
    const service = createDataFnDomainAdminService({ executor, context: () => ({ namespace: "tenant_1" }) });

    const first = await service.listRecords({ filter: { resource: "tasks" }, limit: 1 }, context);
    expect(first.data.items).toEqual([{ id: "tasks:task-1", recordId: "linked-record" }]);
    const nextCursor = first.data.nextCursor;
    expect(nextCursor).toEqual(expect.any(String));
    await service.listRecords({ filter: { resource: "tasks" }, limit: 1, cursor: nextCursor! }, context);
    expect(query.mock.calls[1]?.[0]).toMatchObject({
      resource: "tasks",
      cursor: { after: { createdAt: "2026-08-15", id: "task-1" } },
    });

    await expect(service.listRecords({ filter: { resource: "other" }, cursor: nextCursor! }, context))
      .rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("round-trips resource names containing colons through composite record IDs", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: "record-1" }], nextCursor: null })
      .mockResolvedValueOnce({ data: [{ id: "record-1" }], nextCursor: null });
    const executor = {
      schema: { version: 1, resources: [{ name: "orders:v2", version: 1 }] },
      query,
    } as unknown as DatafnExecutor<{ namespace: string }>;
    const service = createDataFnDomainAdminService({ executor, context: () => ({ namespace: "tenant_1" }) });

    const listed = await service.listRecords({ filter: { resource: "orders:v2" } }, context);
    expect(listed.data.items).toEqual([{ id: "orders%3Av2:record-1" }]);
    await expect(service.getRecord({ id: "orders%3Av2:record-1" }, context)).resolves.toMatchObject({
      data: { item: { id: "orders%3Av2:record-1" } },
    });
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({
      resource: "orders:v2",
      filters: { id: "record-1" },
    }), { namespace: "tenant_1" });
  });
});
