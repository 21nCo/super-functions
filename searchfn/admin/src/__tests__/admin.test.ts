import { describe, expect, it, vi } from "vitest";
import {
  searchFnAdminCapability,
  createSearchFnAdminAdapter,
  createSearchFnAdminClient,
  createSearchFnDomainAdminService,
  type SearchFnAdminService,
} from "../index.js";
import { MemoryAdapter } from "@searchfn/adapter-memory";
import type { AdminClient } from "@superfunctions/admin";

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

describe("@searchfn/admin", () => {
  it("declares the inventoried operator surface and mutation policy", () => {
    expect(searchFnAdminCapability.schemaVersion).toBe("1.0");
    expect(searchFnAdminCapability.availability).toBe("required-product");
    expect(searchFnAdminCapability.scopeLevels).toEqual([
      "organization",
      "workspace",
      "project",
      "environment",
    ]);
    expect(
      searchFnAdminCapability.operations.some(
        (operation) => operation.id === "searchfn.adapters-backends.list",
      ),
    ).toBe(true);
    const mutation = searchFnAdminCapability.operations.find(
      (operation) => operation.safety.classification !== "read",
    );
    expect(mutation).toMatchObject({
      safety: {
        audit: "required",
        idempotent: true,
      },
    });
    for (const operationId of ["searchfn.documents.index", "searchfn.documents.remove-document"]) {
      const operation = searchFnAdminCapability.operations.find((candidate) => candidate.id === operationId);
      expect(operation).toMatchObject({
        target: { resource: "documents", collection: true },
      });
      expect(operation?.inputSchema?.required).toContain("id");
    }
  });

  it("delegates the operation and complete scope to the injected domain service", async () => {
    const listAdapters = vi.fn(async (input, operationContext) => ({
      ok: true as const,
      data: {
        items: [{ limit: input.limit }],
        nextCursor: null,
        namespace: operationContext.scope.namespace,
        region: operationContext.scope.region,
      },
    }));
    const service = { listAdapters } as unknown as SearchFnAdminService;
    const adapter = createSearchFnAdminAdapter(service);
    expect(Object.keys(adapter.handlers).sort()).toEqual(
      searchFnAdminCapability.operations.map((operation) => operation.id).sort(),
    );

    const result = await adapter.execute(
      "searchfn.adapters-backends.list",
      { limit: 25 },
      context,
    );

    expect(result.data).toEqual({
      items: [{ limit: 25 }],
      nextCursor: null,
      namespace: "tenant_1",
      region: "in-south",
    });
    expect(listAdapters).toHaveBeenCalledWith({ limit: 25 }, context);
  });

  it("exposes named typed clients for index mutations", async () => {
    const invokeOperation = vi.fn(async () => ({ ok: true, data: { accepted: true } }));
    const client = createSearchFnAdminClient({ invokeOperation } as unknown as AdminClient);

    await client.documents.index(
      { id: "docs:doc-1", payload: { fields: { title: "Console" } } },
      { idempotencyKey: "idem_index" },
    );

    expect(invokeOperation).toHaveBeenCalledWith(
      "searchfn.documents.index",
      { id: "docs:doc-1", payload: { fields: { title: "Console" } } },
      { idempotencyKey: "idem_index" },
    );
  });

  it("binds isolated index mutations to the real SearchFn adapter", async () => {
    const adapters = new Map([
      ["environment_1", new MemoryAdapter()],
      ["environment_2", new MemoryAdapter()],
    ]);
    const adapter = createSearchFnAdminAdapter(
      createSearchFnDomainAdminService({
        adapter: (admin) => adapters.get(admin.scope.environmentId ?? "")!,
        resources: () => ["docs"],
      }),
    );
    await adapter.execute("searchfn.documents.index", {
      id: "docs:doc-1",
      payload: { fields: { title: "Super Console" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({
      resource: "docs",
      query: "Console",
    })).resolves.toEqual(["doc-1"]);
    await expect(adapters.get("environment_2")!.search({
      resource: "docs",
      query: "Console",
    })).resolves.toEqual([]);

    await adapter.execute("searchfn.documents.index", {
      id: "docs:001",
      payload: { fields: { title: "Leading zero" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({
      resource: "docs",
      query: "Leading",
    })).resolves.toEqual(["001"]);

    await adapter.execute("searchfn.documents.index", {
      id: "docs:123",
      payload: { fields: { title: "Numeric-looking string" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Numeric-looking" })).resolves.toEqual(["123"]);

    await adapter.execute("searchfn.documents.batch-index", {
      payload: { resource: "docs", documents: [{ id: 123, fields: { title: "Numeric identifier" } }] },
    }, context);
    await adapter.execute("searchfn.documents.remove-document", { id: "docs:123" }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Numeric identifier" })).resolves.toEqual([123]);
    await adapter.execute("searchfn.documents.remove-document", { id: "docs:number:123" }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Numeric" })).resolves.toEqual([]);

    await adapter.execute("searchfn.documents.batch-index", {
      payload: { resource: "docs", documents: [{ id: 1.5, fields: { title: "Floating identifier" } }] },
    }, context);
    await adapter.execute("searchfn.documents.remove-document", { id: "docs:number:1.5" }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Floating" })).resolves.toEqual([]);

    await adapter.execute("searchfn.documents.index", {
      id: "docs:string:string%3Aliteral",
      payload: { fields: { title: "Literal string prefix" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Literal" })).resolves.toEqual(["string:literal"]);
    await adapter.execute("searchfn.documents.index", {
      id: "docs:string:number%3A123",
      payload: { fields: { title: "Escaped numeric prefix" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Escaped" })).resolves.toEqual(["number:123"]);
    await adapter.execute("searchfn.documents.remove-document", { id: "docs:string:number%3A123" }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "docs", query: "Escaped" })).resolves.toEqual([]);

    await adapter.execute("searchfn.documents.remove-document", {
      id: "docs:doc-1",
    }, context);
    await expect(adapters.get("environment_1")!.search({
      resource: "docs",
      query: "Console",
    })).resolves.toEqual([]);

    const colonAdapter = createSearchFnAdminAdapter(createSearchFnDomainAdminService({
      adapter: () => adapters.get("environment_1")!,
      resources: () => ["orders:v2"],
    }));
    await colonAdapter.execute("searchfn.documents.index", {
      id: "orders%3Av2:string:doc-1",
      payload: { fields: { title: "Versioned resource" } },
    }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "orders:v2", query: "Versioned" }))
      .resolves.toEqual(["doc-1"]);
    await colonAdapter.execute("searchfn.documents.remove-document", {
      id: "orders%3Av2:string:doc-1",
    }, context);
    await expect(adapters.get("environment_1")!.search({ resource: "orders:v2", query: "Versioned" }))
      .resolves.toEqual([]);
  });

  it("applies index list search, sorting, limits, and cursors", async () => {
    const adapter = createSearchFnAdminAdapter(createSearchFnDomainAdminService({
      adapter: () => new MemoryAdapter(),
      resources: () => ["zeta", "alpha", "beta"],
    }));
    const first = await adapter.execute("searchfn.indexes-collections.list", {
      search: "a",
      sort: [{ field: "name", direction: "asc" }],
      limit: 2,
    }, context);
    expect(first.data).toMatchObject({
      items: [{ id: "alpha" }, { id: "beta" }],
      nextCursor: expect.any(String),
    });
    const second = await adapter.execute("searchfn.indexes-collections.list", {
      search: "a",
      sort: [{ field: "name", direction: "asc" }],
      limit: 2,
      cursor: (first.data as { nextCursor: string }).nextCursor,
    }, context);
    expect(second.data).toEqual({ items: [{ id: "zeta", name: "zeta", status: "available" }], nextCursor: null });
    const cursor = (first.data as { nextCursor: string }).nextCursor;
    await expect(adapter.execute("searchfn.health.list", { cursor }, context))
      .rejects.toMatchObject({ code: "invalid_argument" });
    await expect(adapter.execute("searchfn.indexes-collections.list", { search: "z", sort: [{ field: "name", direction: "asc" }], cursor }, context))
      .rejects.toMatchObject({ code: "invalid_argument" });
  });
});
