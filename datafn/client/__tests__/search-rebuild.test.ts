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

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("PROV-012: deferred clone indexing and rebuild lifecycle", () => {
  it("defers clone indexing and emits rebuild progress to completion", async () => {
    const storage = new MemoryStorageAdapter();
    const remote = makeRemoteCloneAdapter([
      { id: "t1", title: "Quarterly report" },
      { id: "t2", title: "Budget report" },
    ]);

    const updateIndices = vi.fn().mockResolvedValue(undefined);
    const events: any[] = [];
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

    client.subscribe((event: any) => {
      if (event.type === "sync_applied" || event.type === "sync_failed") {
        events.push(event);
      }
    });

    await client.sync.start();
    expect(updateIndices).toHaveBeenCalledTimes(0);

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "sync_applied" &&
          event.context?.phase === "search-rebuild" &&
          event.context?.stage === "completed" &&
          event.context?.percent === 100,
      ),
    );
    expect(updateIndices).toHaveBeenCalled();

    await client.destroy();
  });

  it("retries rebuild after failure and completes", async () => {
    const storage = new MemoryStorageAdapter();
    const remote = makeRemoteCloneAdapter([{ id: "t1", title: "Retry report" }]);

    const updateIndices = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(undefined);
    const events: any[] = [];

    const client = createDatafnClient({
      schema,
      clientId: "rebuild-retry-client",
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

    client.subscribe((event: any) => {
      if (event.type === "sync_applied" || event.type === "sync_failed") {
        events.push(event);
      }
    });

    await client.sync.start();

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "sync_failed" &&
          event.context?.phase === "search-rebuild" &&
          event.context?.stage === "failed",
      ),
    );
    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "sync_applied" &&
          event.context?.phase === "search-rebuild" &&
          event.context?.stage === "completed" &&
          event.context?.percent === 100,
      ),
    );
    expect(updateIndices.mock.calls.length).toBeGreaterThanOrEqual(2);

    await client.destroy();
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
