import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
      indices: { search: ["title"] },
    },
  ],
  relations: [],
};

function makeRemoteCloneAdapter(records: Array<Record<string, unknown>>) {
  return {
    query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
    mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mutationId: "m", affectedIds: [], errors: [], deduped: false } }),
    transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, results: [] } }),
    seed: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    clone: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        data: { tasks: records },
        cursors: { tasks: "1" },
        next: { tasks: null },
      },
    }),
    pull: vi.fn().mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, deleted: {}, cursors: {}, hasMore: false },
    }),
    push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, accepted: [] } }),
    reconcile: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mismatches: [] } }),
  };
}

describe("PROV-012: search index lifecycle", () => {
  it("defers clone indexing and hydrates the searched resource lazily once", async () => {
    const storage = new MemoryStorageAdapter();
    const remote = makeRemoteCloneAdapter([
      { id: "t1", title: "Quarterly report" },
      { id: "t2", title: "Budget report" },
    ]);

    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const client = createDatafnClient({
      schema,
      clientId: "rebuild-client",
      storage,
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
      sync: {
        mode: "sync",
        remoteAdapter: remote,
        offlinability: true,
        skipCloneIndexing: true,
      },
    });

    await client.sync.start();
    expect(updateIndices).toHaveBeenCalledTimes(0);

    await client.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    expect(updateIndices).toHaveBeenCalledTimes(1);
    expect(updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "tasks",
        records: expect.arrayContaining([
          expect.objectContaining({ id: "t1" }),
          expect.objectContaining({ id: "t2" }),
        ]),
        operation: "upsert",
      }),
    );

    await client.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    expect(updateIndices).toHaveBeenCalledTimes(1);

    await client.destroy();
  });

  it("uses a persistent index marker to avoid rehydrating records in a new client", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.upsertRecord("tasks", { id: "t1", title: "Marked report" });
    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");

    const updateIndices = vi.fn().mockResolvedValue(undefined);

    const firstClient = createDatafnClient({
      schema,
      clientId: "search-marker-client-1",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
      sync: { mode: "local-only" },
    });

    await firstClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    expect(updateIndices).toHaveBeenCalledTimes(1);
    await firstClient.destroy();

    const listRecords = vi.spyOn(storage, "listRecords");
    const secondUpdateIndices = vi.fn().mockResolvedValue(undefined);
    const secondClient = createDatafnClient({
      schema,
      clientId: "search-marker-client-2",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices: secondUpdateIndices,
      },
      sync: { mode: "local-only" },
    });

    await secondClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    expect(secondUpdateIndices).toHaveBeenCalledTimes(0);
    expect(listRecords).not.toHaveBeenCalledWith("tasks");

    await secondClient.destroy();
  });

  it("clears provider-owned documents before rebuilding a changed fingerprint", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.upsertRecord("tasks", { id: "t1", title: "Current report" });
    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");

    const firstClient = createDatafnClient({
      schema,
      clientId: "search-rebuild-clear-client-1",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices: vi.fn().mockResolvedValue(undefined),
        clearIndices: vi.fn().mockResolvedValue(undefined),
      },
      sync: { mode: "local-only" },
    });
    await firstClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    await firstClient.destroy();

    const calls: string[] = [];
    const secondClient = createDatafnClient({
      schema,
      clientId: "search-rebuild-clear-client-2",
      storage,
      searchIndexVersion: "test-search-v2",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        clearIndices: vi.fn(async () => {
          calls.push("clear");
        }),
        updateIndices: vi.fn(async () => {
          calls.push("upsert");
        }),
      },
      sync: { mode: "local-only" },
    });

    await secondClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });

    expect(calls).toEqual(["clear", "upsert"]);
    await secondClient.destroy();
  });

  it("refuses a changed-fingerprint rebuild when the provider cannot clear stale documents", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.upsertRecord("tasks", { id: "t1", title: "Current report" });
    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");

    const firstClient = createDatafnClient({
      schema,
      clientId: "search-rebuild-required-clear-client-1",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices: vi.fn().mockResolvedValue(undefined),
      },
      sync: { mode: "local-only" },
    });
    await firstClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    await firstClient.destroy();

    const secondClient = createDatafnClient({
      schema,
      clientId: "search-rebuild-required-clear-client-2",
      storage,
      searchIndexVersion: "test-search-v2",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices: vi.fn().mockResolvedValue(undefined),
      },
      sync: { mode: "local-only" },
    });

    await expect(secondClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    })).rejects.toThrow("must implement clearIndices");
    await secondClient.destroy();
  });

  it("marks clone-indexed resources current so first search after reload does not rehydrate", async () => {
    const storage = new MemoryStorageAdapter();
    const remote = makeRemoteCloneAdapter([
      { id: "t1", title: "Cloned report" },
      { id: "t2", title: "Synced report" },
    ]);
    const updateIndices = vi.fn().mockResolvedValue(undefined);

    const firstClient = createDatafnClient({
      schema,
      clientId: "search-clone-marker-client-1",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
      sync: {
        mode: "sync",
        remoteAdapter: remote,
        offlinability: true,
      },
    });

    await firstClient.sync.start();
    expect(updateIndices).toHaveBeenCalledTimes(1);
    await firstClient.destroy();

    const listRecords = vi.spyOn(storage, "listRecords");
    const secondUpdateIndices = vi.fn().mockResolvedValue(undefined);
    const secondClient = createDatafnClient({
      schema,
      clientId: "search-clone-marker-client-2",
      storage,
      searchIndexVersion: "test-search-v1",
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices: secondUpdateIndices,
      },
      sync: { mode: "local-only" },
    });

    await secondClient.search({
      query: "report",
      resources: ["tasks"],
      source: "local",
    });
    expect(secondUpdateIndices).toHaveBeenCalledTimes(0);
    expect(listRecords).not.toHaveBeenCalledWith("tasks");

    await secondClient.destroy();
  });

  it("applies local mutation index update while deferred clone indexing is enabled", async () => {
    const storage = new MemoryStorageAdapter();
    const remote = makeRemoteCloneAdapter([]);
    const updateIndices = vi.fn().mockResolvedValue(undefined);

    await storage.setHydrationState("tasks", "hydrating");
    await storage.setHydrationState("tasks", "ready");

    const client = createDatafnClient({
      schema,
      clientId: "rebuild-local-mutation-client",
      storage,
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
      sync: {
        mode: "sync",
        remoteAdapter: remote,
        offlinability: true,
        skipCloneIndexing: true,
      },
    });

    const result: any = await client.tasks.mutate({
      operation: "insert",
      id: "t-local-1",
      record: { title: "Local insert" },
    });

    expect(result.ok).toBe(true);
    expect(updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "tasks",
        operation: "upsert",
      }),
    );

    await client.destroy();
  });
});
