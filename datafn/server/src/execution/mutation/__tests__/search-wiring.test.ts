import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";
import type { SearchProvider } from "../../../search-provider.js";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string" },
      ],
    },
  ],
  relations: [],
};

function makeProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name: "mock",
    search: vi.fn().mockResolvedValue([]),
    searchAll: vi.fn().mockResolvedValue([]),
    updateIndices: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function postMutation(server: any, body: object): Promise<any> {
  const req = new Request("http://localhost/datafn/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await server.router.handle(req);
  return res.json();
}

describe("TV-HOOK-001: search index updated on successful insert mutation", () => {
  let server: any;
  let db: any;
  let provider: SearchProvider;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    provider = makeProvider();
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });
  });

  it("calls updateIndices with upsert on successful insert", async () => {
    await postMutation(server, {
      resource: "tasks",
      version: "1",
      clientId: "c1",
      mutationId: "m1",
      operation: "insert",
      id: "task-1",
      record: { title: "New Task", status: "active" },
    });

    expect(provider.updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "tasks", operation: "upsert" }),
    );
  });

  it("calls updateIndices with upsert on successful merge", async () => {
    await db.create({ model: "tasks", data: { id: "task-2", title: "Old" }, namespace: "datafn" });

    await postMutation(server, {
      resource: "tasks",
      version: "1",
      clientId: "c1",
      mutationId: "m2",
      operation: "merge",
      id: "task-2",
      record: { title: "New Title" },
    });

    expect(provider.updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "tasks", operation: "upsert" }),
    );
  });
});

describe("TV-HOOK-002: search index updated on successful delete mutation", () => {
  let server: any;
  let db: any;
  let provider: SearchProvider;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "task-del", title: "To Delete" }, namespace: "datafn" });
    provider = makeProvider();
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });
  });

  it("calls updateIndices with delete on successful delete mutation", async () => {
    await postMutation(server, {
      resource: "tasks",
      version: "1",
      clientId: "c2",
      mutationId: "m-del",
      operation: "delete",
      id: "task-del",
    });

    expect(provider.updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "tasks", operation: "delete" }),
    );
  });
});

describe("fail-soft: search index errors do not fail mutations", () => {
  it("mutation succeeds even if updateIndices throws", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({
      updateIndices: vi.fn().mockRejectedValue(new Error("Search provider down")),
    });
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });

    const body = await postMutation(server, {
      resource: "tasks",
      version: "1",
      clientId: "c3",
      mutationId: "m-fail",
      operation: "insert",
      id: "task-safe",
      record: { title: "Safe Insert" },
    });

    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const record = await db.findOne({
      model: "tasks",
      where: [{ field: "id", operator: "eq", value: "task-safe" }],
      namespace: "datafn",
    });
    expect(record).toBeTruthy();
  });
});

describe("TV-NOPROV-001: no searchProvider configured — mutations work normally", () => {
  it("insert works without search provider", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db });

    const body = await postMutation(server, {
      resource: "tasks",
      version: "1",
      clientId: "c4",
      mutationId: "m-noprov",
      operation: "insert",
      id: "task-np",
      record: { title: "No Provider" },
    });

    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
  });
});

describe("TV-INIT-001: searchProvider.initialize is called on server startup", () => {
  it("calls initialize on startup with resource list", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ initialize: vi.fn().mockResolvedValue(undefined) });
    const schemaWithIndices: DatafnSchema = {
      ...schema,
      resources: schema.resources.map((resource) => ({
        ...resource,
        indices: { search: ["title"] },
      })),
    };

    await createDatafnServer({
      allowUnknownResources: true,
      schema: schemaWithIndices,
      db,
      searchProvider: provider,
    });

    expect(provider.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({ name: "tasks", searchFields: ["title"] }),
        ]),
      }),
    );
  });

  it("fails startup if initialize throws", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ initialize: vi.fn().mockRejectedValue(new Error("Init error")) });

    await expect(
      createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider }),
    ).rejects.toThrow("Search provider initialization failed");
  });

  it("excludes resources without indices.search from initialize payload", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const schemaWithIndices: DatafnSchema = {
      version: 1,
      resources: [
        {
          name: "tasks",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
          indices: { search: ["title"] },
        },
        {
          name: "notes",
          version: 1,
          fields: [{ name: "body", type: "string" }],
        },
      ],
      relations: [],
    };
    const init = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ initialize: init });

    await createDatafnServer({
      allowUnknownResources: true,
      schema: schemaWithIndices,
      db,
      searchProvider: provider,
    });

    expect(init).toHaveBeenCalledWith({
      resources: [{ name: "tasks", searchFields: ["title"] }],
    });
  });
});

describe("TV-DISP-001: searchProvider.dispose is called on server.close()", () => {
  it("calls dispose when server is closed", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ dispose: vi.fn().mockResolvedValue(undefined) });
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });

    await server.close();

    expect(provider.dispose).toHaveBeenCalledTimes(1);
  });
});
