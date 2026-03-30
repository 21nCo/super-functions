import { describe, expect, it, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "todos",
      version: 1,
      fields: [{ name: "text", type: "string" as const }],
      indices: { search: ["text"] },
    },
  ],
  relations: [],
};

function createBrowserProvider() {
  return {
    name: "browser-search",
    initialize: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(["todo:1"]),
    searchAll: vi.fn().mockResolvedValue([{ resource: "todos", id: "todo:1", score: 0.8 }]),
    updateIndices: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createRemoteAdapter() {
  return {
    query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
    mutation: vi.fn().mockResolvedValue({
      ok: true,
      result: { ok: true, mutationId: "m1", affectedIds: [], errors: [], deduped: false },
    }),
    transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, results: [] } }),
    seed: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    clone: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        data: { todos: [{ id: "todo:sync", text: "sync item" }] },
        cursors: { todos: "1" },
        next: { todos: null },
      },
    }),
    pull: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        records: { todos: [{ id: "todo:sync", text: "sync item" }] },
        deleted: {},
        cursors: { todos: "1" },
        hasMore: false,
      },
    }),
    push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, accepted: [] } }),
    reconcile: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mismatches: [] } }),
  };
}

async function markReady(storage: MemoryStorageAdapter, resource: string) {
  await storage.setHydrationState(resource, "hydrating");
  await storage.setHydrationState(resource, "ready");
}

describe("browser-owned search regression", () => {
  it("TV-DFS-001: continues to initialize and update JavaScript indices for non-native providers", async () => {
    const storage = new MemoryStorageAdapter();
    const provider = createBrowserProvider();
    const remote = createRemoteAdapter();

    await markReady(storage, "todos");

    const client = createDatafnClient({
      schema,
      clientId: "browser-regression-client",
      storage,
      searchProvider: provider,
      sync: {
        mode: "sync",
        offlinability: true,
        remoteAdapter: remote,
      },
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:1",
      record: { text: "buy milk" },
    });
    await client.sync.start();

    expect(provider.initialize).toHaveBeenCalledWith({
      resources: [{ name: "todos", searchFields: ["text"] }],
    });
    expect(provider.updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "todos",
        operation: "upsert",
      }),
    );
    expect(provider.updateIndices.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
