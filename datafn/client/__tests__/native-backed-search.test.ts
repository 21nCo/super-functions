import { describe, expect, it, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import { createClientSearchPlugin } from "../src/plugins/clientSearch.js";
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
    {
      name: "categories",
      version: 1,
      fields: [{ name: "name", type: "string" as const }],
      indices: { search: ["name"] },
    },
    {
      name: "audit",
      version: 1,
      fields: [{ name: "kind", type: "string" as const }],
      indices: { search: [] },
    },
  ],
  relations: [],
};

function createNativeSearchProvider() {
  return {
    __datafnNativeBacked: true as const,
    name: "native-search",
    initialize: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(["todo:1"]),
    searchAll: vi.fn().mockResolvedValue([{ resource: "todos", id: "todo:1", score: 0.9 }]),
    updateIndices: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createRemoteAdapter() {
  return {
    __datafnNativeBacked: true as const,
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
        data: { todos: [{ id: "todo:1", text: "buy milk" }] },
        cursors: { todos: "1" },
        next: { todos: null },
      },
    }),
    pull: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        records: { todos: [{ id: "todo:1", text: "buy milk" }] },
        deleted: {},
        cursors: { todos: "1" },
        hasMore: false,
      },
    }),
    push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, accepted: [] } }),
    reconcile: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mismatches: [] } }),
  };
}

function createNativeSyncController() {
  return {
    __datafnNativeBacked: true as const,
    handshake: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        bridgeVersion: 1,
        schemaHash: "abc123",
        namespace: "default",
        storageBackend: "coredata" as const,
        syncOwner: "native" as const,
        remoteMode: "datafn-server" as const,
        indexedDbDisabled: true,
        capabilities: ["storage", "remote", "sync", "events", "health", "search"],
      },
    }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    pullNow: vi.fn().mockResolvedValue(undefined),
    cloneNow: vi.fn().mockResolvedValue(undefined),
    reconcileNow: vi.fn().mockResolvedValue(undefined),
    schedulePush: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(() => () => {}),
  };
}

async function markReady(storage: MemoryStorageAdapter, resource: string) {
  await storage.setHydrationState(resource, "hydrating");
  await storage.setHydrationState(resource, "ready");
}

describe("native-backed search mode", () => {
  it("TV-DFS-002 / TV-DFS-003: initializes from schema indices and routes client.search() through the native provider", async () => {
    const storage = Object.assign(new MemoryStorageAdapter(), {
      __datafnNativeBacked: true as const,
    });
    const provider = createNativeSearchProvider();
    const remote = createRemoteAdapter();
    const controller = createNativeSyncController();

    await markReady(storage, "todos");
    await storage.upsertRecord("todos", { id: "todo:1", text: "buy milk" });

    const client = createDatafnClient({
      schema,
      clientId: "native-search-client",
      storage,
      searchProvider: provider,
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: remote,
        native: {
          syncController: controller,
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
        },
      },
    });

    const result: any = await client.search({ query: "milk" });

    expect(provider.initialize).toHaveBeenCalledWith({
      resources: [
        { name: "todos", searchFields: ["text"] },
        { name: "categories", searchFields: ["name"] },
      ],
    });
    expect(provider.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "milk",
        limit: 50,
        limitPerResource: 50,
      }),
    );
    expect(result).toEqual({
      results: [
        {
          id: "todo:1",
          resource: "todos",
          score: 0.9,
          data: { id: "todo:1", text: "buy milk" },
        },
      ],
    });
  });

  it("TV-DFS-004: skips JavaScript-side mutation and sync index maintenance when provider is native-backed", async () => {
    const storage = Object.assign(new MemoryStorageAdapter(), {
      __datafnNativeBacked: true as const,
    });
    const provider = createNativeSearchProvider();
    const remote = createRemoteAdapter();
    const controller = createNativeSyncController();

    await markReady(storage, "todos");

    const client = createDatafnClient({
      schema,
      clientId: "native-search-lifecycle-client",
      storage,
      searchProvider: provider,
      plugins: [createClientSearchPlugin({ storage, searchProvider: provider })],
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: remote,
        native: {
          syncController: controller,
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
        },
      },
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:2",
      record: { text: "buy bread" },
    });

    await client.sync.start();

    expect(provider.updateIndices).not.toHaveBeenCalled();
  });

  it("routes DFQL search clauses through the native-backed provider without JavaScript index rebuild hooks", async () => {
    const storage = new MemoryStorageAdapter();
    const provider = createNativeSearchProvider();

    await markReady(storage, "todos");
    await storage.upsertRecord("todos", { id: "todo:1", text: "buy milk" });

    const client = createDatafnClient({
      schema,
      clientId: "native-query-search-client",
      storage,
      searchProvider: provider,
      plugins: [createClientSearchPlugin({ storage, searchProvider: provider })],
      sync: { mode: "local-only" },
    });

    const result: any = await client.query({
      resource: "todos",
      search: { query: "milk", prefix: true },
    });

    expect(provider.search).toHaveBeenCalledWith({
      resource: "todos",
      query: "milk",
      type: undefined,
      fields: undefined,
      limit: undefined,
      prefix: true,
      fuzzy: undefined,
      fieldBoosts: undefined,
      signal: undefined,
    });
    expect(provider.updateIndices).not.toHaveBeenCalled();
    expect(result.data).toEqual([{ id: "todo:1", text: "buy milk" }]);
  });
});
