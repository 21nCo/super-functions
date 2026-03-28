/**
 * Client namespace tests
 * TV-NS-016, TV-NS-018, TV-NS-022, TV-NS-023, TV-NS-025, TV-NS-034, TV-NS-035, TV-NS-038
 * Requirements: NS-007, NS-008, NS-010, NS-011, NS-012, NS-020, NS-022
 */

import { describe, expect, it, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import { defineSchema } from "@datafn/core";

const schema = defineSchema({
  resources: [
    { name: "task", version: 1, fields: [{ name: "title", type: "string" as const, required: true }] },
  ],
});

// ---------------------------------------------------------------------------
// NS-007: Client `namespace` config
// ---------------------------------------------------------------------------
describe("Client namespace config (NS-007)", () => {
  // TV-NS-016: client with namespace config
  it("TV-NS-016: factory called with namespace string", () => {
    let receivedArg: unknown;
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "org:user-1",
      storage: (ns) => {
        receivedArg = ns;
        return new MemoryStorageAdapter(["task"]);
      },
    });
    expect(receivedArg).toBe("org:user-1");
    expect(client.currentNamespace()).toBe("org:user-1");
  });

});

// ---------------------------------------------------------------------------
// NS-008 / NS-019: Storage factory signature
// ---------------------------------------------------------------------------
describe("Storage factory (NS-008, NS-019)", () => {
  // TV-NS-018: new factory with namespace string
  it("TV-NS-018/035: factory receives namespace string", () => {
    let receivedArg: unknown;
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "my-ns",
      storage: (ns) => {
        receivedArg = ns;
        return new MemoryStorageAdapter(["task"]);
      },
    });
    expect(receivedArg).toBe("my-ns");
  });

  // TV-NS-034: factory without namespace throws
  it("TV-NS-034: factory without namespace throws DFQL_INVALID", () => {
    expect(() => {
      createDatafnClient({
        schema,
        clientId: "dev1",
        storage: () => new MemoryStorageAdapter(["task"]),
      });
    }).toThrow("namespace is required when storage is a factory function");
  });
});

// ---------------------------------------------------------------------------
// NS-010: MemoryStorageAdapter namespace support
// ---------------------------------------------------------------------------
describe("MemoryStorageAdapter namespace factory (NS-010)", () => {
  // TV-NS-022: memory adapter in namespace factory
  it("TV-NS-022: MemoryStorageAdapter works as factory target", () => {
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "any",
      storage: () => new MemoryStorageAdapter(["task"]),
    });
    expect(client).toBeDefined();
    expect(client.currentNamespace()).toBe("any");
  });
});

// ---------------------------------------------------------------------------
// NS-012: currentNamespace()
// ---------------------------------------------------------------------------
describe("currentNamespace (NS-012)", () => {
  // TV-NS-025: returns resolved namespace
  it("TV-NS-025: returns resolved namespace string", () => {
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "workspace:123",
      storage: new MemoryStorageAdapter(["task"]),
    });
    expect(client.currentNamespace()).toBe("workspace:123");
  });

  // TV-NS-025 negative: no namespace
  it("TV-NS-025 negative: returns undefined when no namespace", () => {
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      storage: new MemoryStorageAdapter(["task"]),
    });
    expect(client.currentNamespace()).toBeUndefined();
  });

});

// ---------------------------------------------------------------------------
// NS-011: switchContext with namespace
// ---------------------------------------------------------------------------
describe("switchContext with namespace (NS-011)", () => {
  // TV-NS-023: switch with namespace
  it("TV-NS-023: switchContext updates namespace", async () => {
    let factoryArg: unknown;
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "old-ns",
      storage: (ns) => {
        factoryArg = ns;
        return new MemoryStorageAdapter(["task"]);
      },
    });
    expect(client.currentNamespace()).toBe("old-ns");

    await client.switchContext({ namespace: "new-org:new-user" });
    expect(client.currentNamespace()).toBe("new-org:new-user");
    expect(factoryArg).toBe("new-org:new-user");
  });

  it("preserves the current client when rebuilding the next context fails", async () => {
    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "old-ns",
      storage: new MemoryStorageAdapter(["task"]),
      sync: { mode: "local-only" },
    });

    await expect(client.switchContext({ namespace: "" })).rejects.toMatchObject({
      code: "DFQL_INVALID",
    });

    expect(client.currentNamespace()).toBe("old-ns");
    await expect(client.query({ resource: "task", version: 1 })).resolves.toBeDefined();
  });

  it("rejects queued switchContext calls when the lead switch fails", async () => {
    const failingRemote = {
      query: vi.fn(async () => ({ ok: true, result: { data: [], nextCursor: null } })),
      mutation: vi.fn(async () => ({ ok: true, result: {} })),
      transact: vi.fn(async () => ({ ok: true, result: {} })),
      seed: vi.fn(async () => ({ ok: true, result: {} })),
      clone: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("clone failed");
      }),
      pull: vi.fn(async () => ({ ok: true, result: {} })),
      push: vi.fn(async () => ({ ok: true, result: {} })),
      reconcile: vi.fn(async () => ({ ok: true, result: {} })),
    };

    const client = createDatafnClient({
      schema,
      clientId: "dev1",
      namespace: "old-ns",
      storage: new MemoryStorageAdapter(["task"]),
      sync: { mode: "local-only" },
    });

    const lead = client.switchContext({
      namespace: "sync-ns",
      storage: new MemoryStorageAdapter(["task"]),
      sync: { mode: "sync", remoteAdapter: failingRemote, offlinability: true },
    });
    const queued = client.switchContext({ namespace: "queued-ns" });

    await expect(lead).rejects.toThrow("clone failed");
    await expect(queued).rejects.toThrow("clone failed");
    expect(client.currentNamespace()).toBe("old-ns");
  });

});

// ---------------------------------------------------------------------------
// NS-022: Empty namespace validation on client
// ---------------------------------------------------------------------------
describe("Empty namespace validation (NS-022)", () => {
  // TV-NS-038: empty namespace rejected
  it("TV-NS-038: empty namespace throws DFQL_INVALID", () => {
    expect(() => {
      createDatafnClient({
        schema,
        clientId: "dev1",
        namespace: "",
        storage: new MemoryStorageAdapter(["task"]),
      });
    }).toThrow("namespace must be a non-empty string");
  });
});

// ---------------------------------------------------------------------------
// NS-020: Client re-exports ns
// ---------------------------------------------------------------------------
describe("Client re-exports (NS-020)", () => {
  it("ns is re-exported from @datafn/client", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.ns).toBe("function");
    expect(mod.ns("a", "b")).toBe("a:b");
  });
});
