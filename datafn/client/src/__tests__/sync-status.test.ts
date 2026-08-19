import { describe, expect, it, vi } from "vitest";
import { createDatafnClient } from "../client.js";
import { MemoryStorageAdapter } from "../adapters/memoryStorage.js";
import type { DatafnRemoteAdapter } from "../client.js";

const schema: any = {
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo:",
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("sync status", () => {
  it("exposes a native status signal with coalesced pending changes", async () => {
    const storage = new MemoryStorageAdapter(["todos"]);
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "client:status-local",
      sync: { mode: "local-only", offlinability: true },
      getTimestamp: () => 1000,
    });
    const values: Array<ReturnType<typeof client.sync.getStatus>> = [];
    const unsubscribe = client.sync.statusSignal().subscribe((value) => {
      values.push(value);
    });

    await client.todos.mutate({
      operation: "insert",
      id: "todo:1",
      record: { title: "One" },
    });
    await client.todos.mutate({
      operation: "insert",
      id: "todo:2",
      record: { title: "Two" },
    });

    expect(client.sync.getStatus().pendingChanges).toBe(0);

    await wait(300);

    expect(client.sync.getStatus()).toMatchObject({
      mode: "local-only",
      status: "ready",
      pendingChanges: 2,
      lastError: null,
    });
    expect(values.some((value) => value.pendingChanges === 2)).toBe(true);

    unsubscribe();
    await client.destroy();
  });

  it("reports sync phases and last sync time from DataFn sync events", async () => {
    const storage = new MemoryStorageAdapter(["todos"]);
    const remote = createRemoteAdapter({
      pull: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          records: {},
          deleted: {},
          cursors: { todos: "0" },
          hasMore: false,
        },
      }),
    });
    let now = 100;
    const client = createDatafnClient({
      schema,
      storage,
      clientId: "client:status-sync",
      sync: { mode: "sync", remoteAdapter: remote, offlinability: true },
      getTimestamp: () => now++,
    });
    const values: Array<ReturnType<typeof client.sync.getStatus>> = [];
    const unsubscribe = client.sync.statusSignal().subscribe((value) => {
      values.push(value);
    });

    await client.sync.pullNow();

    expect(remote.pull).toHaveBeenCalledTimes(1);
    expect(values.some((value) => value.status === "syncing" && value.phase === "pull")).toBe(true);
    expect(client.sync.getStatus()).toMatchObject({
      mode: "sync",
      status: "ready",
      phase: null,
      lastSyncAt: 101,
      lastError: null,
    });

    unsubscribe();
    await client.destroy();
  });
});

function createRemoteAdapter(
  overrides: Partial<DatafnRemoteAdapter> = {},
): DatafnRemoteAdapter {
  const success = async () => ({ ok: true, result: { ok: true } });
  return {
    query: success,
    mutation: success,
    transact: success,
    seed: success,
    clone: async () => ({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    }),
    pull: async () => ({
      ok: true,
      result: {
        ok: true,
        records: {},
        deleted: {},
        cursors: {},
        hasMore: false,
      },
    }),
    push: success,
    reconcile: success,
    ...overrides,
  };
}
