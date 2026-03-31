import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  createDatafnClient,
  IndexedDbStorageAdapter,
} from "../src/index.js";
import { SyncEngine } from "../src/sync/engine.js";

const schema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string" as const, required: false },
        { name: "completed", type: "boolean" as const, required: false },
      ],
    },
  ],
  relations: [],
} as const;

async function listIndexedDbNames(): Promise<string[]> {
  const dbFactory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };

  if (typeof dbFactory.databases !== "function") {
    return [];
  }

  const databases = await dbFactory.databases();
  return databases
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string");
}

async function resetIndexedDb(): Promise<void> {
  const names = await listIndexedDbNames();
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    ),
  );
}

async function markReady(
  storage: IndexedDbStorageAdapter,
  resource: string,
): Promise<void> {
  await storage.setHydrationState(resource, "hydrating");
  await storage.setHydrationState(resource, "ready");
}

describe("browser-owned mode regression coverage", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetIndexedDb();
  });

  it("TV-API-001 / TV-SYN-002: keeps IndexedDB-backed browser mode on the JavaScript SyncEngine", async () => {
    const dbName = `browser_mode_${Math.random().toString(36).slice(2, 10)}`;
    const storage = IndexedDbStorageAdapter.create({ dbName, schema });
    const remote = {
      query: vi.fn(async () => ({
        ok: true as const,
        result: { data: [], nextCursor: null },
      })),
      mutation: vi.fn(async () => ({
        ok: true as const,
        result: {
          ok: true,
          mutationId: "remote-mutation",
          affectedIds: [],
          deduped: false,
        },
      })),
      transact: vi.fn(async () => ({
        ok: true as const,
        result: { ok: true, results: [] },
      })),
      seed: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
      clone: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
      pull: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
      push: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
      reconcile: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
    };

    const startSpy = vi
      .spyOn(SyncEngine.prototype, "start")
      .mockResolvedValue(undefined);
    const scheduleSpy = vi.spyOn(SyncEngine.prototype, "schedulePush");

    await markReady(storage, "tasks");
    await storage.upsertRecord("tasks", {
      id: "task:1",
      title: "A",
      completed: false,
    });

    const client = createDatafnClient({
      schema,
      clientId: "browser-client",
      storage,
      sync: {
        owner: "javascript",
        mode: "sync",
        offlinability: true,
        remoteAdapter: remote,
        pushInterval: 5_000,
      },
    });

    await client.sync.start();
    const queryResult = await client.query({
      resource: "tasks",
      version: 1,
      filters: { completed: false },
    });
    const mutationResult = await client.mutate({
      resource: "tasks",
      version: 1,
      operation: "merge",
      id: "task:1",
      record: { completed: true },
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(queryResult).toMatchObject({
      data: [{ id: "task:1", title: "A", completed: false }],
      nextCursor: null,
    });
    expect(mutationResult).toMatchObject({
      ok: true,
      affectedIds: ["task:1"],
    });
    expect(await storage.getRecord("tasks", "task:1")).toMatchObject({
      id: "task:1",
      completed: true,
    });
    expect(await storage.changelogList()).toHaveLength(1);
    expect(await listIndexedDbNames()).toContain(dbName);
    expect(remote.query).not.toHaveBeenCalled();
    expect(remote.mutation).not.toHaveBeenCalled();

    client.sync.stop();
    await client.destroy();
  });
});
