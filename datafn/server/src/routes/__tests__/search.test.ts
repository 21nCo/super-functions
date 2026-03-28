import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnServer } from "../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../core-types.js";
import type { SearchProvider } from "../../search-provider.js";

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
    {
      name: "notes",
      version: 1,
      fields: [
        { name: "body", type: "string" },
      ],
    },
  ],
  relations: [],
};

function makeSearchProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name: "test-provider",
    search: vi.fn().mockResolvedValue([]),
    searchAll: vi.fn().mockResolvedValue([]),
    updateIndices: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function readJson(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

function enableNativeSearch(db: any): void {
  db.capabilities.operations.fulltext = true;
}

describe("TV-HTTP-001: POST /datafn/search — basic routing", () => {
  let server: any;
  let db: any;
  let searchProvider: SearchProvider;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();

    await db.create({ model: "tasks", data: { id: "t1", title: "hello world", status: "active" }, namespace: "datafn" });

    searchProvider = makeSearchProvider({
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
    });

    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });
  });

  it("returns results for valid search request", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hello" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.results).toBeInstanceOf(Array);
    expect(body.result.results[0].id).toBe("t1");
    expect(body.result.results[0].resource).toBe("tasks");
    expect(typeof body.result.results[0].score).toBe("number");
  });

  it("accepts optional fields: resources, fields, limit, select", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "hello",
        resources: ["tasks"],
        fields: ["title"],
        limit: 10,
        select: ["id", "title"],
      }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
  });
});

describe("TV-HTTP-003: POST /datafn/search — no search provider configured", () => {
  it("returns DFQL_UNSUPPORTED when no searchProvider and no DB-native support", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "anything" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNSUPPORTED");
    expect(body.error.message).toBe("No search provider configured and DB adapter has no native search support");
  });
});

describe("TV-HTTP-002: POST /datafn/search — DB-native fallback without search provider", () => {
  it("returns search results when DB-native search is available", async () => {
    const db = memoryAdapter();
    await db.initialize();
    enableNativeSearch(db);
    await db.create({
      model: "tasks",
      data: { id: "t-native", title: "Quarterly report", status: "active" },
      namespace: "datafn",
    });
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "report" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.results[0]).toMatchObject({
      id: "t-native",
      resource: "tasks",
    });
  });
});

describe("TV-HTTP-004: POST /datafn/search — authorization", () => {
  it("forwards 'search' action to authorize callback", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const authFn = vi.fn().mockResolvedValue(true);
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider, authorize: authFn });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test" }),
    });

    await server.router.handle(req);

    expect(authFn).toHaveBeenCalledWith(
      expect.anything(),
      "search",
      expect.objectContaining({ query: "test" }),
    );
  });

  it("returns FORBIDDEN when authorize denies search", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      searchProvider,
      authorize: async () => false,
    });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("TV-VLIM-001: query validation", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });
  });

  it("rejects missing query field", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.details.path).toBe("query");
  });

  it("rejects empty string query", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "   " }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.message).toBe("Search query must not be empty");
  });

  it("rejects overlong query with LIMIT_EXCEEDED", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "a".repeat(1001) }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("LIMIT_EXCEEDED");
    expect(body.error.message).toBe("Search query exceeds maximum length");
  });
});

describe("TV-VLIM-003: resources validation", () => {
  let server: any;

  beforeEach(async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });
  });

  it("rejects resources that is not an array", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", resources: "tasks" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.details.path).toBe("resources");
  });

  it("rejects resources array with more than 50 items", async () => {
    const tooManyResources = Array.from({ length: 51 }, (_, i) => `r${i}`);
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", resources: tooManyResources }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("LIMIT_EXCEEDED");
    expect(body.error.message).toBe("Too many resources in search request");
    expect(body.error.details.path).toBe("resources");
  });
});

describe("TV-VLIM-005: limitPerResource validation", () => {
  let server: any;

  beforeEach(async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });
  });

  it("clamps limitPerResource greater than 1000", async () => {
    const provider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", limitPerResource: 1001 }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
    expect((provider.searchAll as any).mock.calls[0][0].limitPerResource).toBe(1000);
  });

  it("accepts limitPerResource of exactly 1000", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", limitPerResource: 1000 }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
  });

  it("rejects non-positive limit", async () => {
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", limit: 0 }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.details.path).toBe("limit");
  });

  it("clamps limit greater than 10000", async () => {
    const provider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider: provider });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", limit: 50000 }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
    expect((provider.searchAll as any).mock.calls[0][0].limit).toBe(10000);
  });
});

describe("TV-VLIM-006: filter complexity caps", () => {
  it("rejects filter depth > 5", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "test",
        filters: {
          tasks: {
            a: { b: { c: { d: { e: { f: { eq: 1 } } } } } },
          },
        },
      }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.message).toBe("Search filters exceed allowed complexity");
  });

  it("rejects filter condition count > 200", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = makeSearchProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const server = await createDatafnServer({ allowUnknownResources: true, schema, db, searchProvider });

    const conditions = Array.from({ length: 201 }, (_, i) => ({ [`f${i}`]: { eq: i } }));
    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "test",
        filters: { tasks: { $and: conditions } },
      }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("LIMIT_EXCEEDED");
    expect(body.error.message).toBe("Search filters exceed allowed complexity");
  });
});

describe("TV-SRV-002: search option validation and forwarding", () => {
  it("forwards prefix/fuzzy/fieldBoosts to provider.searchAll", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({
      model: "tasks",
      data: { id: "t-opt", title: "option test", status: "active" },
      namespace: "datafn",
    });
    const provider = makeSearchProvider({
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t-opt", score: 0.9 }]),
    });
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      searchProvider: provider,
    });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "option",
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(true);
    expect((provider.searchAll as any).mock.calls[0][0]).toMatchObject({
      prefix: true,
      fuzzy: 0.2,
      fieldBoosts: { title: 2 },
    });
  });

  it("rejects non-boolean prefix with canonical error", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      searchProvider: makeSearchProvider(),
    });

    const req = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", prefix: "true" }),
    });

    const res = await server.router.handle(req);
    const body = await readJson(res);

    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.message).toBe("Invalid request: prefix must be boolean");
    expect(body.error.details.path).toBe("prefix");
  });

  it("rejects invalid fuzzy and fieldBoosts values with path-specific errors", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      searchProvider: makeSearchProvider(),
    });

    const fuzzyReq = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", fuzzy: -1 }),
    });
    const fuzzyRes = await server.router.handle(fuzzyReq);
    const fuzzyBody = await readJson(fuzzyRes);
    expect(fuzzyBody.ok).toBe(false);
    expect(fuzzyBody.error.code).toBe("DFQL_INVALID");
    expect(fuzzyBody.error.details.path).toBe("fuzzy");

    const boostReq = new Request("http://localhost/datafn/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", fieldBoosts: { title: "2" } }),
    });
    const boostRes = await server.router.handle(boostReq);
    const boostBody = await readJson(boostRes);
    expect(boostBody.ok).toBe(false);
    expect(boostBody.error.code).toBe("DFQL_INVALID");
    expect(boostBody.error.details.path).toBe("fieldBoosts.title");
  });
});
