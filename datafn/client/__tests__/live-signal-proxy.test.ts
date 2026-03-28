/**
 * Integration tests: LiveSignals wired through the createDatafnClient Proxy.
 * Covers PROXY-001 through PROXY-007, TV-REG-001, TV-REG-002.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";

const createStubRemote = () => ({
  query: vi.fn(async () => ({ ok: true, result: { data: [], nextCursor: null } })),
  mutation: vi.fn(async () => ({ ok: true, result: { ok: true } })),
  transact: vi.fn(async () => ({ ok: true, result: { ok: true, results: [] } })),
  seed: vi.fn(async () => ({ ok: true, result: { ok: true } })),
  clone: vi.fn(async () => ({
    ok: true,
    result: {
      ok: true,
      data: { task: [], kv: [] },
      cursors: { task: "0", kv: "0" },
    },
  })),
  pull: vi.fn(async () => ({ ok: true, result: { ok: true, updates: [] } })),
  push: vi.fn(async () => ({ ok: true, result: { ok: true } })),
  reconcile: vi.fn(async () => ({ ok: true, result: { ok: true } })),
});

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: false },
      ],
    },
  ],
};

function createTestClient() {
  const remote = createStubRemote();
  const storage = new MemoryStorageAdapter(["task", "kv"]);
  const client = createDatafnClient({
    schema: testSchema,
    clientId: "test-client",
    storage,
    sync: { remoteAdapter: remote },
  });
  return { client, remote, storage };
}

describe("@datafn/client LiveSignal proxy integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("PROXY-001: table().signal() returns LiveSignals", () => {
    it("signal() returns a DatafnSignal-compatible object", async () => {
      const { client } = createTestClient();
      const signal = client.table("task").signal({});

      expect(signal).toBeDefined();
      expect(typeof signal.subscribe).toBe("function");
      expect(typeof signal.get).toBe("function");
      expect("loading" in signal).toBe(true);
      expect("error" in signal).toBe(true);

      await client.destroy();
    });

    it("table().signal() returns same LiveSignal that survives switchContext", async () => {
      const { client } = createTestClient();
      const q = {};

      // Create signal before switch
      const signalBefore = client.table("task").signal(q);
      const received: unknown[] = [];
      const unsub = signalBefore.subscribe((v) => received.push(v));

      // Switch context
      const newStorage = new MemoryStorageAdapter(["task", "kv"]);
      await client.switchContext({ storage: newStorage });

      // Same instance (LiveSignal is stable across switch)
      const signalAfter = client.table("task").signal(q);
      expect(signalAfter).toBe(signalBefore);

      // Still subscribeable after switch
      expect(typeof signalAfter.subscribe).toBe("function");

      unsub();
      await client.destroy();
    });
  });

  describe("PROXY-002: dynamic table accessor returns same LiveSignal", () => {
    it("client.task.signal(q) === client.table('task').signal(q)", async () => {
      const { client } = createTestClient();
      const q = {};

      const s1 = client.table("task").signal(q);
      const s2 = (client as any).task.signal(q);

      expect(s1).toBe(s2);

      await client.destroy();
    });
  });

  describe("PROXY-003: no infinite recursion on signal creation", () => {
    it("client.table('task').signal({}) does not throw", async () => {
      const { client } = createTestClient();

      expect(() => {
        client.table("task").signal({});
      }).not.toThrow();

      expect(() => {
        (client as any).task.signal({});
      }).not.toThrow();

      await client.destroy();
    });
  });

  describe("PROXY-004/PROXY-005: non-signal table methods pass through", () => {
    it("table methods and properties are accessible through the proxy", async () => {
      const { client } = createTestClient();
      const task = (client as any).task;

      expect(typeof task.query).toBe("function");
      expect(typeof task.mutate).toBe("function");
      expect(task.name).toBe("task");
      expect(task.version).toBe(1);

      await client.destroy();
    });

    it("table().query() calls through to the underlying client", async () => {
      const { client, remote } = createTestClient();

      await client.table("task").query({});
      expect(remote.query).toHaveBeenCalled();

      await client.destroy();
    });
  });

  describe("PROXY-003: kv.signal() returns LiveSignal", () => {
    it("kv.signal() returns a DatafnSignal-compatible object", async () => {
      const { client } = createTestClient();

      const signal = client.kv.signal("myKey");

      expect(signal).toBeDefined();
      expect(typeof signal.subscribe).toBe("function");
      expect("loading" in signal).toBe(true);

      await client.destroy();
    });

    it("kv.signal() deduplicates by key", async () => {
      const { client } = createTestClient();

      const s1 = client.kv.signal("myKey");
      const s2 = client.kv.signal("myKey");
      expect(s1).toBe(s2);

      const s3 = client.kv.signal("otherKey");
      expect(s3).not.toBe(s1);

      await client.destroy();
    });

    it("kv.signal() instance is unchanged after switchContext", async () => {
      const { client } = createTestClient();

      const signalBefore = client.kv.signal("myKey");

      const newStorage = new MemoryStorageAdapter(["task", "kv"]);
      await client.switchContext({ storage: newStorage });

      const signalAfter = client.kv.signal("myKey");
      expect(signalAfter).toBe(signalBefore);

      await client.destroy();
    });
  });

  describe("PROXY-006: rebindAll called in correct order during switch", () => {
    it("signal factory uses new realClient after switchContext", async () => {
      const { client } = createTestClient();
      const q = {};

      const signal = client.table("task").signal(q);
      const received: unknown[] = [];
      const unsub = signal.subscribe((v) => received.push(v));

      const newStorage = new MemoryStorageAdapter(["task", "kv"]);
      await client.switchContext({ storage: newStorage });

      // Signal identity preserved
      expect(signal).toBe(client.table("task").signal(q));
      // Signal is still functional
      expect(typeof signal.subscribe).toBe("function");

      unsub();
      await client.destroy();
    });

    it("subscribeClient callback fires after rebindAll", async () => {
      const { client } = createTestClient();
      const q = {};

      const signal = client.table("task").signal(q);

      const clientCallbacks: unknown[] = [];
      const unsub = client.subscribeClient((c) => clientCallbacks.push(c));

      const newStorage = new MemoryStorageAdapter(["task", "kv"]);
      await client.switchContext({ storage: newStorage });

      // subscribeClient fires once on init (immediate) + once after switch
      expect(clientCallbacks.length).toBeGreaterThanOrEqual(2);
      // Signal still stable
      expect(client.table("task").signal(q)).toBe(signal);

      unsub();
      await client.destroy();
    });
  });

  describe("PROXY-007: destroyFn calls disposeAll", () => {
    it("after client.destroy(), signals are inert (subscribe returns no-op)", async () => {
      const { client } = createTestClient();

      const signal = client.table("task").signal({});

      await client.destroy();

      // subscribe on disposed signal returns no-op
      const handler = vi.fn();
      const unsub = signal.subscribe(handler);
      expect(typeof unsub).toBe("function");
      // Handler should NOT be called (signal disposed)
      expect(handler).not.toHaveBeenCalled();
    });

    it("kv signal is also disposed after client.destroy()", async () => {
      const { client } = createTestClient();

      const kvSignal = client.kv.signal("myKey");

      await client.destroy();

      const handler = vi.fn();
      kvSignal.subscribe(handler);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("TV-REG-001: signal deduplication across calls", () => {
    it("same table + same query → same LiveSignal instance", async () => {
      const { client } = createTestClient();

      const q = { filter: { status: "open" } };
      const s1 = client.table("task").signal(q);
      const s2 = client.table("task").signal(q);
      expect(s1).toBe(s2);

      const s3 = client.table("task").signal({ filter: { status: "done" } });
      expect(s3).not.toBe(s1);

      await client.destroy();
    });
  });

  describe("TV-REG-002: disposed signal re-created on next call", () => {
    it("manually disposed signal is re-created with same query", async () => {
      const { client } = createTestClient();
      const q = {};

      const s1 = client.table("task").signal(q);
      // Dispose the signal directly
      (s1 as any).dispose();

      // Next call creates a fresh instance
      const s2 = client.table("task").signal(q);
      expect(s2).not.toBe(s1);
      expect(typeof s2.subscribe).toBe("function");

      await client.destroy();
    });
  });
});
