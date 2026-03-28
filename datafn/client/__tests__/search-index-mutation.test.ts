import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const }],
    },
  ],
};

function makeRemoteAdapter() {
  return {
    query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
    mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, mutationId: "m", affectedIds: [], errors: [], deduped: false } }),
    transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, results: [] } }),
    seed: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    clone: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    pull: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    push: vi.fn().mockResolvedValue({ ok: true, result: {} }),
    reconcile: vi.fn().mockResolvedValue({ ok: true, result: {} }),
  };
}

async function makeReady(storage: MemoryStorageAdapter, resource: string): Promise<void> {
  await storage.setHydrationState(resource, "hydrating");
  await storage.setHydrationState(resource, "ready");
}

describe("IDX-001/IDX-002: local mutation search index lifecycle", () => {
  it("updates indices in deterministic order for local-first batch and skips non-indexed operations", async () => {
    const storage = new MemoryStorageAdapter();
    await makeReady(storage, "task");

    const remote = makeRemoteAdapter();
    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "idx-local-first",
      sync: { mode: "sync", offlinability: true, remoteAdapter: remote },
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
    });

    const result = (await client.task.mutate([
      { operation: "insert", id: "task:1", record: { title: "One" } },
      { operation: "delete", id: "task:2" },
      { operation: "share", id: "task:1", shareWith: { userId: "u2", level: "read" } },
    ])) as any[];

    expect(result).toHaveLength(3);
    expect(result.every((entry) => entry.ok === true)).toBe(true);
    expect(remote.mutation).not.toHaveBeenCalled();
    expect(updateIndices).toHaveBeenCalledTimes(2);
    expect(updateIndices.mock.calls[0][0]).toMatchObject({
      resource: "task",
      operation: "upsert",
    });
    expect(updateIndices.mock.calls[0][0].records[0]).toMatchObject({
      id: "task:1",
      title: "One",
    });
    expect(updateIndices.mock.calls[1][0]).toEqual({
      resource: "task",
      operation: "delete",
      records: [{ id: "task:2" }],
    });
  });

  it("updates index for debounced merge after optimistic local write", async () => {
    const storage = new MemoryStorageAdapter();
    await makeReady(storage, "task");
    await storage.upsertRecord("task", { id: "task:deb", title: "before", status: "draft" });

    const remote = makeRemoteAdapter();
    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "idx-debounce",
      sync: { mode: "sync", offlinability: true, remoteAdapter: remote },
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
    });

    const result: any = await client.task.mutate({
      operation: "merge",
      id: "task:deb",
      record: { title: "after" },
      debounceKey: "task:deb",
      debounceMs: 25,
    });

    expect(result.ok).toBe(true);
    expect(updateIndices).toHaveBeenCalledTimes(1);
    expect(updateIndices).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "task",
        operation: "upsert",
        records: [
          expect.objectContaining({
            id: "task:deb",
            title: "after",
            status: "draft",
          }),
        ],
      }),
    );
  });

  it("maps upsert and delete operations in offline fallback mode", async () => {
    const storage = new MemoryStorageAdapter();
    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "idx-offline",
      sync: { mode: "local-only" },
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
    });

    const upsertOps = [
      { operation: "insert", id: "task:i", record: { title: "i" } },
      { operation: "merge", id: "task:m", record: { title: "m" } },
      { operation: "replace", id: "task:r", record: { title: "r" } },
      { operation: "trash", id: "task:t" },
      { operation: "restore", id: "task:rs" },
      { operation: "archive", id: "task:a" },
      { operation: "unarchive", id: "task:u" },
    ];

    for (const mutation of upsertOps) {
      const result: any = await client.task.mutate(mutation as any);
      expect(result.ok).toBe(true);
    }

    await client.task.mutate({ operation: "delete", id: "task:d" });

    expect(updateIndices).toHaveBeenCalledTimes(upsertOps.length + 1);
    for (let i = 0; i < upsertOps.length; i += 1) {
      const call = updateIndices.mock.calls[i][0];
      expect(call.operation).toBe("upsert");
      expect(call.resource).toBe("task");
      expect(call.records[0].id).toBe(upsertOps[i].id);
    }
    const deleteCall = updateIndices.mock.calls[upsertOps.length][0];
    expect(deleteCall).toEqual({
      resource: "task",
      operation: "delete",
      records: [{ id: "task:d" }],
    });
  });

  it("keeps mutation successful when index update throws and logs warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new MemoryStorageAdapter();
    const updateIndices = vi
      .fn()
      .mockRejectedValue(new Error("disk full"));
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "idx-fail-soft",
      sync: { mode: "local-only" },
      searchProvider: {
        name: "provider",
        search: vi.fn().mockResolvedValue([]),
        searchAll: vi.fn().mockResolvedValue([]),
        updateIndices,
      },
    });

    const result: any = await client.task.mutate({
      operation: "insert",
      id: "task:warn",
      record: { title: "warn" },
    });

    expect(result.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "Search index update failed (non-fatal)",
      expect.objectContaining({
        operation: "search-index-update",
        resource: "task",
        error: expect.stringContaining("disk full"),
      }),
    );
  });
});
