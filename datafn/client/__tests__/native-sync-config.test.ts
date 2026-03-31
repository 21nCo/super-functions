import { describe, expect, it } from "vitest";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import { createDatafnClient } from "../src/client.js";
import type { DatafnClientError } from "../src/errors.js";

const schema = {
  resources: [{ name: "tasks", version: 1, fields: [] }],
} as const;

function createNativeStorage() {
  return Object.assign(new MemoryStorageAdapter(), {
    __datafnNativeBacked: true as const,
  });
}

function createNativeRemoteAdapter() {
  return {
    __datafnNativeBacked: true as const,
    query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
    mutation: async () => ({ ok: true, result: { ok: true } }),
    transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
    seed: async () => ({ ok: true, result: { ok: true } }),
    clone: async () => ({ ok: true, result: { ok: true } }),
    pull: async () => ({ ok: true, result: { ok: true } }),
    push: async () => ({ ok: true, result: { ok: true } }),
    reconcile: async () => ({ ok: true, result: { ok: true } }),
  };
}

function createNativeSyncController() {
  return {
    __datafnNativeBacked: true as const,
    handshake: async () => ({
      ok: true as const,
      result: {
        bridgeVersion: 1,
        schemaHash: "abc123",
        namespace: "default",
        storageBackend: "coredata" as const,
        syncOwner: "native" as const,
        remoteMode: "datafn-server" as const,
        indexedDbDisabled: true,
        capabilities: ["storage", "remote", "sync", "events", "health"],
      },
    }),
    start: async () => {},
    stop: async () => {},
    pullNow: async () => {},
    cloneNow: async () => {},
    reconcileNow: async () => {},
    schedulePush: async () => {},
    onEvent: () => () => {},
  };
}

describe("native sync config validation", () => {
  it("TV-API-001: browser-owned mode remains valid", () => {
    const client = createDatafnClient({
      schema,
      clientId: "browser-client",
      sync: {
        owner: "javascript",
        mode: "sync",
        offlinability: true,
        remote: "https://api.example.com/datafn",
      },
      storage: new MemoryStorageAdapter(),
    });

    expect(client).toBeDefined();
  });

  it("TV-API-002: native-backed datafn-server mode validates successfully", () => {
    const client = createDatafnClient({
      schema,
      clientId: "native-client",
      storage: createNativeStorage(),
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: createNativeRemoteAdapter(),
        native: {
          syncController: createNativeSyncController(),
          remoteMode: "datafn-server",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
          remoteProfile: "default",
        },
      },
    });

    expect(client).toBeDefined();
  });

  it("TV-API-003: native-backed icloud mode validates successfully", () => {
    const client = createDatafnClient({
      schema,
      clientId: "icloud-client",
      storage: createNativeStorage(),
      sync: {
        owner: "native",
        mode: "sync",
        offlinability: true,
        remoteAdapter: createNativeRemoteAdapter(),
        native: {
          syncController: createNativeSyncController(),
          remoteMode: "icloud",
          expectedSchemaHash: "abc123",
          failIfUnavailable: true,
        },
      },
    });

    expect(client).toBeDefined();
  });

  it("TV-API-002N: native-backed mode rejects missing native-backed pieces", () => {
    expect(() =>
      createDatafnClient({
        schema,
        clientId: "broken-native-client",
        storage: new MemoryStorageAdapter(),
        sync: {
          owner: "native",
          mode: "sync",
          offlinability: true,
          remoteAdapter: createNativeRemoteAdapter(),
          native: {
            syncController: createNativeSyncController(),
            remoteMode: "datafn-server",
            expectedSchemaHash: "abc123",
          },
        },
      }),
    ).toThrow();

    try {
      createDatafnClient({
        schema,
        clientId: "broken-native-client",
        storage: new MemoryStorageAdapter(),
        sync: {
          owner: "native",
          mode: "sync",
          offlinability: true,
          remoteAdapter: createNativeRemoteAdapter(),
          native: {
            syncController: createNativeSyncController(),
            remoteMode: "datafn-server",
            expectedSchemaHash: "abc123",
          },
        },
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe(
        "native sync owner requires native-backed storage, remoteAdapter, and native config",
      );
      expect(err.details).toEqual({ path: "sync.native" });
    }
  });

  it("TV-API-003N: native icloud mode rejects direct javascript remote ownership", () => {
    expect(() =>
      createDatafnClient({
        schema,
        clientId: "icloud-client",
        storage: createNativeStorage(),
        sync: {
          owner: "native",
          mode: "sync",
          offlinability: true,
          remote: "https://api.example.com/datafn",
          remoteAdapter: createNativeRemoteAdapter(),
          native: {
            syncController: createNativeSyncController(),
            remoteMode: "icloud",
            expectedSchemaHash: "abc123",
          },
        },
      }),
    ).toThrow();

    try {
      createDatafnClient({
        schema,
        clientId: "icloud-client",
        storage: createNativeStorage(),
        sync: {
          owner: "native",
          mode: "sync",
          offlinability: true,
          remote: "https://api.example.com/datafn",
          remoteAdapter: createNativeRemoteAdapter(),
          native: {
            syncController: createNativeSyncController(),
            remoteMode: "icloud",
            expectedSchemaHash: "abc123",
          },
        },
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe(
        "native icloud mode forbids direct JavaScript remote ownership",
      );
      expect(err.details).toEqual({ path: "sync.remote" });
    }
  });
});
