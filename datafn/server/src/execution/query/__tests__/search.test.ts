import { describe, it, expect, vi } from "vitest";
import { executeSearchQuery } from "../search.js";
import type { SearchProvider } from "../../../search-provider.js";
import type { DatafnSchema } from "../../../core-types.js";
import type { DataStore } from "../../store.js";
import { DatafnExecutionError } from "../../errors.js";

const mockSchema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string" },
        { name: "status", type: "string" },
      ],
    },
  ],
  relations: [],
};

const mockRecords = [
  { id: "task-1", title: "Urgent Task", status: "active" },
  { id: "task-2", title: "Normal Task", status: "completed" },
  { id: "task-3", title: "Another Urgent", status: "completed" },
];

const mockStore: DataStore = {
  getRecords: (res) => (res === "tasks" ? mockRecords : []),
  getRecord: (res, id) =>
    res === "tasks" ? mockRecords.find((r) => r.id === id) || null : null,
  getJoinRows: () => [],
  findRecords: (res, field, value) =>
    (res === "tasks" ? mockRecords : []).filter((r) => r[field as keyof typeof r] === value),
};

const mockSearchProvider: SearchProvider = {
  name: "test-search",
  search: vi.fn(),
  updateIndices: vi.fn(),
};

describe("executeSearchQuery", () => {
  it("should merge search candidates with filters", async () => {
    // Setup provider to return specific candidates
    (mockSearchProvider.search as any).mockResolvedValue([
      "task-1",
      "task-3",
    ]);

    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "urgent", type: "fullText" as const },
      filters: { status: "active" }, // Should filter out task-3 (completed)
    };

    const result: any = await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      mockSearchProvider,
    );

    expect(mockSearchProvider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "tasks",
        query: "urgent",
        type: "fullText",
        fields: undefined,
        limit: undefined,
        prefix: undefined,
        fuzzy: undefined,
        fieldBoosts: undefined,
      }),
    );

    // Expect implicit filter: status=active AND id IN ["task-1", "task-3"]
    // task-1: status=active (Match)
    // task-3: status=completed (Fail)
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("task-1");
  });

  it("should throw if search block is missing", async () => {
    const query = { resource: "tasks", version: 1 };
    await expect(
      executeSearchQuery(query, mockSchema, mockStore, mockSearchProvider),
    ).rejects.toThrow("executeSearchQuery called without search block");
  });

  it("uses fallback candidate resolver when provider is unavailable", async () => {
    const resolveCandidates = vi.fn().mockResolvedValue(["task-1"]);
    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "urgent", type: "fullText" as const },
    };

    const result: any = await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      undefined,
      resolveCandidates,
    );

    expect(resolveCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "tasks",
        query: "urgent",
        prefix: undefined,
        fuzzy: undefined,
        fieldBoosts: undefined,
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("task-1");
  });

  it("forwards prefix/fuzzy/fieldBoosts to provider.search", async () => {
    (mockSearchProvider.search as any).mockResolvedValue(["task-1"]);
    const query = {
      resource: "tasks",
      version: 1,
      search: {
        query: "urgent",
        type: "fullText" as const,
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      },
    };

    await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      mockSearchProvider,
    );

    expect(mockSearchProvider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      }),
    );
  });

  it("throws canonical unsupported when neither provider nor fallback resolver is available", async () => {
    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "urgent", type: "fullText" as const },
    };

    await expect(
      executeSearchQuery(query, mockSchema, mockStore, undefined),
    ).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "No search provider configured and DB adapter has no native search support",
    } satisfies Partial<DatafnExecutionError>);
  });

  it("should handle empty candidates", async () => {
    (mockSearchProvider.search as any).mockResolvedValue([]);

    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "nothing", type: "fullText" as const },
    };

    const result: any = await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      mockSearchProvider,
    );

    expect(result.data).toHaveLength(0);
  });

  it("should respect sort with search results", async () => {
    // Mock returns 1 and 3.
    (mockSearchProvider.search as any).mockResolvedValue([
      "task-3",
      "task-1",
    ]);

    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "urgent", type: "fullText" as const },
      sort: ["id:desc"], 
    };

    const result: any = await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      mockSearchProvider,
    );

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe("task-3");
    expect(result.data[1].id).toBe("task-1");
  });

  it("retains matched ids when chunked search uses a projection without id", async () => {
    const candidateIds = Array.from({ length: 1005 }, (_, i) => `task-${i + 1}`);
    const provider = {
      name: "chunked-search",
      search: vi.fn().mockResolvedValue(candidateIds),
    } as SearchProvider;
    const chunkedStore: DataStore = {
      getRecords: () => candidateIds.map((id) => ({ id, title: id })),
      getRecord: (_resource, id) => ({ id, title: id }),
      getJoinRows: () => [],
      findRecords: (_resource, field, value) =>
        field === "id" && Array.isArray(value)
          ? value.map((id) => ({ id, title: String(id) }))
          : [],
    };

    const result: any = await executeSearchQuery(
      {
        resource: "tasks",
        version: 1,
        search: { query: "all", type: "fullText" },
        select: ["title"],
      },
      mockSchema,
      chunkedStore,
      provider,
    );

    expect(result.data).toHaveLength(1005);
  });
});
