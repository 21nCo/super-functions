import { describe, it, expect, vi } from "vitest";
import { executeSearchQuery } from "../search.js";
import type { SearchFnPlugin } from "../../../plugins/searchfn.js";
import type { DatafnSchema } from "@datafn/core";
import type { DataStore } from "../../store.js";

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
};

const mockSearchPlugin = {
  name: "searchfn",
  runsOn: ["server"],
  selectCandidates: vi.fn(),
  updateIndices: vi.fn(),
} as unknown as SearchFnPlugin;

describe("executeSearchQuery", () => {
  it("should merge search candidates with filters", async () => {
    // Setup plugin to return specific candidates
    (mockSearchPlugin.selectCandidates as any).mockResolvedValue([
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
      mockSearchPlugin,
    );

    expect(mockSearchPlugin.selectCandidates).toHaveBeenCalledWith({
      resource: "tasks",
      query: "urgent",
      type: "fullText",
      fields: undefined,
      topK: undefined,
    });

    // Expect implicit filter: status=active AND id IN ["task-1", "task-3"]
    // task-1: status=active (Match)
    // task-3: status=completed (Fail)
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("task-1");
  });

  it("should throw if search block is missing", async () => {
    const query = { resource: "tasks", version: 1 };
    await expect(
      executeSearchQuery(query, mockSchema, mockStore, mockSearchPlugin),
    ).rejects.toThrow("executeSearchQuery called without search block");
  });

  it("should handle empty candidates", async () => {
    (mockSearchPlugin.selectCandidates as any).mockResolvedValue([]);

    const query = {
      resource: "tasks",
      version: 1,
      search: { query: "nothing", type: "fullText" as const },
    };

    const result: any = await executeSearchQuery(
      query,
      mockSchema,
      mockStore,
      mockSearchPlugin,
    );

    expect(result.data).toHaveLength(0);
  });

  it("should respect sort with search results", async () => {
    // Mock returns 1 and 3.
    (mockSearchPlugin.selectCandidates as any).mockResolvedValue([
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
      mockSearchPlugin,
    );

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe("task-3");
    expect(result.data[1].id).toBe("task-1");
  });
});
