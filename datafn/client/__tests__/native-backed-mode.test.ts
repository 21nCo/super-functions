import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { createDatafnClient, MemoryStorageAdapter } from "../src/index.js";
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
    {
      name: "auditLogs",
      version: 1,
      isRemoteOnly: true,
      fields: [{ name: "kind", type: "string" as const, required: false }],
    },
  ],
  relations: [],
} as const;

type NativeHarnessOptions = {
  remoteMode?: "datafn-server" | "icloud";
  handshakeError?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  schedulePushError?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

function createNativeHarness(options: NativeHarnessOptions = {}) {
  const remoteMode = options.remoteMode ?? "datafn-server";
  const storage = Object.assign(new MemoryStorageAdapter(), {
    __datafnNativeBacked: true as const,
  });
  const controllerCalls: string[] = [];

  const remote = {
    __datafnNativeBacked: true as const,
    query: vi.fn(async (payload: unknown) => {
      if (Array.isArray(payload)) {
        return {
          ok: true as const,
          result: payload.map(() => ({
            source: "native-remote-adapter",
            data: [],
          })),
        };
      }

      return {
        ok: true as const,
        result: { source: "native-remote-adapter", data: [] },
      };
    }),
    mutation: vi.fn(async () => ({
      ok: true as const,
      result: {
        ok: true,
        mutationId: "remote-mutation",
        affectedIds: [],
        deduped: false,
      },
    })),
    transact: vi.fn(async (payload: unknown) => ({
      ok: true as const,
      result: { ok: true, owner: "native", payload },
    })),
    seed: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
    clone: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
    pull: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
    push: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
    reconcile: vi.fn(async () => ({ ok: true as const, result: { ok: true } })),
  };

  const controller = {
    __datafnNativeBacked: true as const,
    handshake: vi.fn(async () => {
      controllerCalls.push("handshake");
      if (options.handshakeError) {
        return {
          ok: false as const,
          error: options.handshakeError,
        };
      }

      return {
        ok: true as const,
        result: {
          bridgeVersion: 1,
          schemaHash: "abc123",
          namespace: "default",
          storageBackend: "coredata" as const,
          syncOwner: "native" as const,
          remoteMode,
          indexedDbDisabled: true,
          capabilities: ["storage", "remote", "sync", "events", "health"],
        },
      };
    }),
    start: vi.fn(async () => {
      controllerCalls.push("start");
    }),
    stop: vi.fn(async () => {
      controllerCalls.push("stop");
    }),
    pullNow: vi.fn(async () => {
      controllerCalls.push("pullNow");
    }),
    cloneNow: vi.fn(async () => {
      controllerCalls.push("cloneNow");
    }),
    reconcileNow: vi.fn(async () => {
      controllerCalls.push("reconcileNow");
    }),
    schedulePush: vi.fn(async () => {
      controllerCalls.push("schedulePush");
      if (options.schedulePushError) {
        throw options.schedulePushError;
      }
    }),
    onEvent: vi.fn(() => () => {}),
  };

  return { storage, remote, controller, controllerCalls };
}

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

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function markReady(
  storage: MemoryStorageAdapter,
  resource: string,
): Promise<void> {
  await storage.setHydrationState(resource, "hydrating");
  await storage.setHydrationState(resource, "ready");
}

describe("native-backed mode", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetIndexedDb();
  });

  it("TV-SYN-001 / TV-MUT-001: delegates sync lifecycle and schedules native push without JavaScript SyncEngine ownership", async () => {
    const harness = createNativeHarness();
    const startSpy = vi.spyOn(SyncEngine.prototype, "start");
    const pullSpy = vi.spyOn(SyncEngine.prototype, "pullNow");
    const cloneSpy = vi.spyOn(SyncEngine.prototype, "cloneNow");
    const reconcileSpy = vi.spyOn(SyncEngine.prototype, "reconcileNow");
    const scheduleSpy = vi.spyOn(SyncEngine.prototype, "schedulePush");

    await markReady(harness.storage, "tasks");
    await harness.storage.upsertRecord("tasks", {
      id: "task:1",
      title: "A",
      completed: false,
    });

    const client = createDatafnClient({
      schema,
      clientId: "native-client",
      storage: harness.storage,
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: harness.remote,
        native: {
          syncController: harness.controller,
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
          remoteProfile: "default",
        },
      },
    });

    const events: Array<Record<string, unknown>> = [];
    const unsubscribe = client.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await client.sync.start();
    await client.sync.pullNow();
    await client.sync.cloneNow();
    await client.sync.reconcileNow();
    client.sync.stop();
    await flushAsyncWork();

    const result = await client.mutate({
      resource: "tasks",
      version: 1,
      operation: "merge",
      id: "task:1",
      record: { completed: true },
    });

    expect(result).toMatchObject({
      ok: true,
      affectedIds: ["task:1"],
    });
    expect(await harness.storage.getRecord("tasks", "task:1")).toMatchObject({
      id: "task:1",
      completed: true,
    });
    expect(await harness.storage.changelogList()).toHaveLength(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mutation_applied",
          resource: "tasks",
        }),
      ]),
    );
    expect(harness.controllerCalls).toEqual(
      expect.arrayContaining([
        "handshake",
        "start",
        "pullNow",
        "cloneNow",
        "reconcileNow",
        "stop",
        "schedulePush",
      ]),
    );
    expect(harness.remote.mutation).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(pullSpy).not.toHaveBeenCalled();
    expect(cloneSpy).not.toHaveBeenCalled();
    expect(reconcileSpy).not.toHaveBeenCalled();
    expect(scheduleSpy).not.toHaveBeenCalled();

    unsubscribe();
    await client.destroy();
  });

  it("TV-QRY-001 / TV-QRY-002 / TV-QRY-003: routes ready queries to storage and hydrating, batch, and remote-only queries to the native remote adapter", async () => {
    const harness = createNativeHarness();
    await harness.storage.upsertRecord("tasks", {
      id: "task:1",
      title: "A",
      completed: false,
    });

    const client = createDatafnClient({
      schema,
      clientId: "native-client",
      storage: harness.storage,
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: harness.remote,
        native: {
          syncController: harness.controller,
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
          remoteProfile: "default",
        },
      },
    });

    await markReady(harness.storage, "tasks");
    const readyResult = await client.query({
      resource: "tasks",
      version: 1,
      filters: { completed: false },
    });
    expect(readyResult).toMatchObject({
      data: [{ id: "task:1", title: "A", completed: false }],
      nextCursor: null,
    });
    expect(harness.remote.query).not.toHaveBeenCalled();

    await harness.storage.setHydrationState("tasks", "hydrating");
    const hydratingResult = await client.query({
      resource: "tasks",
      version: 1,
      filters: { completed: false },
    });
    expect(hydratingResult).toMatchObject({
      source: "native-remote-adapter",
      data: [{ id: "task:1", title: "A", completed: false }],
    });

    const batchResult = await client.query([
      { resource: "tasks", version: 1 },
      { resource: "tasks", version: 1 },
    ]);
    expect(batchResult).toEqual([
      { source: "native-remote-adapter", data: [] },
      { source: "native-remote-adapter", data: [] },
    ]);

    const remoteOnlyResult = await client.query({
      resource: "auditLogs",
      version: 1,
      filters: { kind: "auth" },
    });
    expect(remoteOnlyResult).toMatchObject({
      source: "native-remote-adapter",
      data: [],
    });
    expect(harness.remote.query).toHaveBeenCalledTimes(3);

    await client.destroy();
  });

  it("TV-QRY-003 / TV-QRY-004: icloud mode uses the native runtime for batch queries and rejects remote-only resources explicitly", async () => {
    const harness = createNativeHarness({ remoteMode: "icloud" });
    const client = createDatafnClient({
      schema,
      clientId: "icloud-client",
      storage: harness.storage,
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: harness.remote,
        native: {
          syncController: harness.controller,
          remoteMode: "icloud",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
        },
      },
    });

    const batchResult = await client.query([
      { resource: "tasks", version: 1 },
      { resource: "tasks", version: 1 },
    ]);
    expect(batchResult).toEqual([
      { source: "native-remote-adapter", data: [] },
      { source: "native-remote-adapter", data: [] },
    ]);

    await expect(
      client.query({ resource: "auditLogs", version: 1 }),
    ).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "Remote-only resource is unsupported in icloud mode",
      details: {
        path: "query.resource",
        resource: "auditLogs",
      },
    });

    await expect(
      client.query([null as any, { resource: "auditLogs", version: 1 }] as any),
    ).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "Remote-only resource is unsupported in icloud mode",
      details: {
        path: "query.resource",
        resource: "auditLogs",
      },
    });

    await client.destroy();
  });

  it("TV-SYN-003 / TV-MUT-002: fails before persistence starts when the native bridge is unavailable and never creates IndexedDB", async () => {
    const harness = createNativeHarness({
      handshakeError: {
        code: "BRIDGE_UNAVAILABLE",
        message: "Native-backed mode requires an available bridge",
        details: { path: "sync.native" },
      },
    });
    const getRecordSpy = vi.spyOn(harness.storage, "getRecord");

    const client = createDatafnClient({
      schema,
      clientId: "native-client",
      storage: harness.storage,
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: harness.remote,
        native: {
          syncController: harness.controller,
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
        },
      },
    });

    try {
      await expect(
        client.query({ resource: "tasks", version: 1 }),
      ).rejects.toMatchObject({
        code: "BRIDGE_UNAVAILABLE",
        message: "Native-backed mode requires an available bridge",
        details: { path: "sync.native" },
      });
      expect(getRecordSpy).not.toHaveBeenCalled();
      expect(await listIndexedDbNames()).toEqual([]);
    } finally {
      await client.destroy();
    }
  });
});
