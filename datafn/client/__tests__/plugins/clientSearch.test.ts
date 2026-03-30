import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DatafnSchema, SearchProvider } from "@datafn/core";
import { MemoryStorageAdapter } from "../../src/adapters/memoryStorage.js";
import { createClientSearchPlugin } from "../../src/plugins/clientSearch.js";

const miniSearchConstructor = vi.hoisted(() => vi.fn());

vi.mock("minisearch", () => {
  class MockMiniSearch {
    private readonly fields: string[];
    private readonly docs = new Map<string, Record<string, unknown>>();

    constructor(options: { fields?: string[] }) {
      this.fields = Array.isArray(options?.fields) ? options.fields : [];
    }

    add(doc: Record<string, unknown>) {
      const id = String(doc.id ?? "");
      if (!id) return;
      this.docs.set(id, { ...doc, id });
    }

    search(term: string, options?: { prefix?: boolean }) {
      const q = String(term).trim().toLowerCase();
      if (!q) return [];
      const usePrefix = options?.prefix !== false;
      const matches: Array<{ id: string; score: number }> = [];

      for (const [id, doc] of this.docs.entries()) {
        const haystack = this.fields
          .map((field) => String(doc[field] ?? "").toLowerCase())
          .join(" ")
          .trim();
        if (!haystack) continue;

        const tokenMatch = haystack.includes(q);
        const prefixMatch =
          usePrefix && haystack.split(/\s+/).some((token) => token.startsWith(q));

        if (tokenMatch || prefixMatch) {
          matches.push({ id, score: 1 });
        }
      }

      return matches;
    }

    has(id: string) {
      return this.docs.has(id);
    }

    remove(idOrDoc: string | { id?: string }) {
      const id =
        typeof idOrDoc === "string"
          ? idOrDoc
          : String(idOrDoc?.id ?? "");
      if (id) {
        this.docs.delete(id);
      }
    }

    discard(id: string) {
      this.docs.delete(id);
    }
  }

  class MiniSearchMock extends MockMiniSearch {
    constructor(options: { fields?: string[] }) {
      super(options);
      miniSearchConstructor(options);
    }
  }

  return {
    __esModule: true,
    default: MiniSearchMock,
  };
});

const schema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "title", type: "string", required: true },
        { name: "description", type: "string", required: false },
      ],
      indices: {
        search: ["title", "description"],
      },
    },
    {
      name: "note",
      version: 1,
      idPrefix: "note",
      fields: [
        { name: "id", type: "string", required: true },
        { name: "content", type: "string", required: true },
      ],
    },
  ],
};

type MockProvider = SearchProvider & {
  search: ReturnType<typeof vi.fn>;
  updateIndices: ReturnType<typeof vi.fn>;
};

function makeProvider(): MockProvider {
  return {
    name: "mock-provider",
    search: vi.fn(async () => []),
    updateIndices: vi.fn(async () => undefined),
  } as unknown as MockProvider;
}

describe("clientSearch plugin UNI-001 / UNI-002", () => {
  let storage: MemoryStorageAdapter;

  beforeEach(async () => {
    vi.restoreAllMocks();
    miniSearchConstructor.mockClear();
    storage = new MemoryStorageAdapter();
    await storage.setHydrationState("task", "hydrating");
    await storage.setHydrationState("task", "ready");
  });

  it("TV-UNI-001-P: delegates search to provider and injects deterministic id filter", async () => {
    const provider = makeProvider();
    provider.search.mockResolvedValueOnce(["task:2", "task:1", "task:2"]);

    const plugin = createClientSearchPlugin({ storage, searchProvider: provider });

    const query = {
      resource: "task",
      version: 1,
      search: {
        query: "tes",
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      },
    };

    const transformed = await plugin.beforeQuery!(
      { env: "client", schema },
      query,
    );

    expect(provider.search).toHaveBeenCalledWith({
      resource: "task",
      query: "tes",
      type: undefined,
      fields: undefined,
      limit: undefined,
      prefix: true,
      fuzzy: 0.2,
      fieldBoosts: { title: 2 },
      signal: undefined,
    });

    expect(transformed).toMatchObject({
      filters: { id: { in: ["task:2", "task:1"] } },
      _searchCandidateIds: ["task:2", "task:1"],
    });
  });

  it("TV-UNI-001-P: composes existing filters with candidate id filter", async () => {
    const provider = makeProvider();
    provider.search.mockResolvedValueOnce(["task:1"]);

    const plugin = createClientSearchPlugin({ storage, searchProvider: provider });

    const transformed = (await plugin.beforeQuery!(
      { env: "client", schema },
      {
        resource: "task",
        version: 1,
        search: "meeting",
        filters: { status: { eq: "open" } },
      },
    )) as Record<string, unknown>;

    expect(transformed.filters).toEqual({
      $and: [{ status: { eq: "open" } }, { id: { in: ["task:1"] } }],
    });
    expect(transformed._searchCandidateIds).toEqual(["task:1"]);
  });

  it("TV-UNI-001-N: provider mode does not construct MiniSearch and routes index lifecycle via provider", async () => {
    const provider = makeProvider();

    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Seed",
      description: "from sync",
    });

    const plugin = createClientSearchPlugin({ storage, searchProvider: provider });

    await plugin.afterSync!(
      { env: "client", schema },
      "clone",
      { storage },
      {},
    );

    await storage.upsertRecord("task", {
      id: "task:2",
      title: "Inserted",
      description: "from mutation",
    });

    await plugin.afterMutation!(
      { env: "client", schema },
      { resource: "task", operation: "insert", id: "task:2" },
      {},
    );

    await plugin.afterMutation!(
      { env: "client", schema },
      { resource: "task", operation: "delete", id: "task:1" },
      {},
    );

    expect(miniSearchConstructor).not.toHaveBeenCalled();

    expect(provider.updateIndices).toHaveBeenCalledWith({
      resource: "task",
      records: [
        {
          id: "task:1",
          title: "Seed",
          description: "from sync",
        },
      ],
      operation: "upsert",
    });

    expect(provider.updateIndices).toHaveBeenCalledWith({
      resource: "task",
      records: [
        {
          id: "task:2",
          title: "Inserted",
          description: "from mutation",
        },
      ],
      operation: "upsert",
    });

    expect(provider.updateIndices).toHaveBeenCalledWith({
      resource: "task",
      records: [{ id: "task:1" }],
      operation: "delete",
    });
  });

  it("routes native-backed provider queries but skips provider-owned rebuild and mutation indexing", async () => {
    const provider = {
      ...makeProvider(),
      __datafnNativeBacked: true as const,
    };
    provider.search.mockResolvedValueOnce(["task:1"]);

    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Seed",
      description: "native",
    });

    const plugin = createClientSearchPlugin({ storage, searchProvider: provider });

    const transformed = await plugin.beforeQuery!(
      { env: "client", schema },
      {
        resource: "task",
        version: 1,
        search: { query: "native", prefix: true },
      },
    );

    await plugin.afterSync!(
      { env: "client", schema },
      "clone",
      { storage },
      {},
    );
    await plugin.afterMutation!(
      { env: "client", schema },
      { resource: "task", operation: "insert", id: "task:1" },
      {},
    );

    expect(miniSearchConstructor).not.toHaveBeenCalled();
    expect(provider.search).toHaveBeenCalledWith({
      resource: "task",
      query: "native",
      type: undefined,
      fields: undefined,
      limit: undefined,
      prefix: true,
      fuzzy: undefined,
      fieldBoosts: undefined,
      signal: undefined,
    });
    expect(transformed).toMatchObject({
      filters: { id: { in: ["task:1"] } },
      _searchCandidateIds: ["task:1"],
    });
    expect(provider.updateIndices).not.toHaveBeenCalled();
  });

  it("TV-UNI-002-P: legacy MiniSearch mode still works without provider", async () => {
    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Meeting notes",
      description: "quarterly plan",
    });

    const plugin = createClientSearchPlugin({ storage });

    await plugin.afterSync!(
      { env: "client", schema },
      "clone",
      { storage },
      {},
    );

    const transformed = (await plugin.beforeQuery!(
      { env: "client", schema },
      {
        resource: "task",
        version: 1,
        search: "meeting",
      },
    )) as Record<string, unknown>;

    expect(miniSearchConstructor).toHaveBeenCalledTimes(1);
    expect(transformed._searchCandidateIds).toEqual(["task:1"]);
  });

  it("TV-UNI-002-N: provider mode takes precedence and warns legacy options are deprecated", async () => {
    const provider = makeProvider();
    provider.search.mockResolvedValueOnce(["task:7"]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const plugin = createClientSearchPlugin({
      storage,
      searchProvider: provider,
      boost: { title: 2 },
    });

    const transformed = await plugin.beforeQuery!(
      { env: "client", schema },
      {
        resource: "task",
        version: 1,
        search: { query: "anything", prefix: true },
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("deprecated legacy MiniSearch boost is ignored when provider mode is enabled"),
    );
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(miniSearchConstructor).not.toHaveBeenCalled();
    expect(transformed).toMatchObject({
      filters: { id: { in: ["task:7"] } },
      _searchCandidateIds: ["task:7"],
    });
  });
});
