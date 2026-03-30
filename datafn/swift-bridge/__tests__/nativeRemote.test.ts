import { afterEach, describe, expect, it, vi } from "vitest";
import { executeQuery } from "../../client/src/query.js";
import {
  createNativeBackedRemoteAdapter,
  createNativeBackedStorageAdapter,
  createWKWebViewBridgeBus,
} from "../src/index.js";

type BridgeRequest = {
  protocol: string;
  id: string;
  method: string;
  payload?: any;
};

function installRemoteHost() {
  const calls: BridgeRequest[] = [];
  const postMessage = vi.fn((message: unknown) => {
    const envelope = message as BridgeRequest;
    calls.push(envelope);

    let result: unknown;
    switch (envelope.method) {
      case "remote.query":
        result = { ok: true, result: { source: "native-remote-adapter", data: [] } };
        break;
      case "remote.mutation":
        result = { ok: true, result: { ok: true, mutationId: "m1" } };
        break;
      case "remote.transact":
        result = { ok: true, result: { ok: true, results: [] } };
        break;
      case "storage.getHydrationState":
        result = envelope.payload.resource === "hydratingTasks" ? "hydrating" : "ready";
        break;
      case "storage.listRecords":
        result = [
          { id: "task:1", completed: false },
          { id: "task:2", completed: true },
        ];
        break;
      default:
        result = { ok: true, result: { ok: true } };
        break;
    }

    window.__datafnBridgeReceive__?.({
      protocol: envelope.protocol,
      id: envelope.id,
      ok: true,
      result,
    });
  });

  (globalThis as any).window = {
    webkit: {
      messageHandlers: {
        datafn: { postMessage },
      },
    },
  };

  return { calls };
}

describe("@datafn/swift-bridge native remote adapter", () => {
  const schema = {
    resources: [
      {
        name: "tasks",
        version: 1,
        fields: [
          { name: "id", type: "string" },
          { name: "completed", type: "boolean" },
        ],
      },
      {
        name: "hydratingTasks",
        version: 1,
        fields: [
          { name: "id", type: "string" },
          { name: "completed", type: "boolean" },
        ],
      },
    ],
  } as any;

  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("TV-QRY-002 and TV-QRY-003: routes remote operations through the native bridge", async () => {
    installRemoteHost();
    const remote = createNativeBackedRemoteAdapter(createWKWebViewBridgeBus());

    await expect(
      remote.query({ resource: "tasks", filters: { completed: false } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        source: "native-remote-adapter",
        data: [],
      },
    });

    await expect(
      remote.query({ resource: "auditLogs", filters: { kind: "auth" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        source: "native-remote-adapter",
        data: [],
      },
    });
  });

  it("TV-QRY-001: ready resources query through bridged local storage", async () => {
    const { calls } = installRemoteHost();
    const bus = createWKWebViewBridgeBus();
    const storage = createNativeBackedStorageAdapter(bus);
    const remote = createNativeBackedRemoteAdapter(bus);

    await expect(
      executeQuery(
        remote,
        { resource: "tasks", filters: { completed: false } },
        storage,
        [],
        schema,
      ),
    ).resolves.toEqual({
      data: [{ id: "task:1", completed: false }],
      nextCursor: null,
    });

    expect(calls.map((call) => call.method)).toEqual([
      "storage.getHydrationState",
      "storage.listRecords",
    ]);
  });

  it("TV-QRY-002: hydrating resources route through the native remote adapter", async () => {
    const { calls } = installRemoteHost();
    const bus = createWKWebViewBridgeBus();
    const storage = createNativeBackedStorageAdapter(bus);
    const remote = createNativeBackedRemoteAdapter(bus);

    await expect(
      executeQuery(
        remote,
        { resource: "hydratingTasks", filters: { completed: false } },
        storage,
        [],
        schema,
      ),
    ).resolves.toEqual({
      source: "native-remote-adapter",
      data: [],
    });

    expect(calls.map((call) => call.method)).toEqual([
      "storage.getHydrationState",
      "remote.query",
    ]);
  });

  it("implements the full DatafnRemoteAdapter bridge method map", async () => {
    const { calls } = installRemoteHost();
    const remote = createNativeBackedRemoteAdapter(createWKWebViewBridgeBus());

    await remote.query({ resource: "tasks" });
    await remote.mutation({ resource: "tasks", op: "merge" });
    await remote.transact({ operations: [] });
    await remote.seed({ resources: ["tasks"] });
    await remote.clone({ resources: ["tasks"] });
    await remote.pull({ resources: ["tasks"] });
    await remote.push({ mutations: [] });
    await remote.reconcile({ resources: ["tasks"] });

    expect(calls.map((call) => call.method)).toEqual([
      "remote.query",
      "remote.mutation",
      "remote.transact",
      "remote.seed",
      "remote.clone",
      "remote.pull",
      "remote.push",
      "remote.reconcile",
    ]);
  });

  it("fails fast when the native remote bridge is unavailable", async () => {
    (globalThis as any).window = {};
    const remote = createNativeBackedRemoteAdapter(createWKWebViewBridgeBus());

    await expect(remote.query({ resource: "tasks" })).rejects.toMatchObject({
      code: "BRIDGE_UNAVAILABLE",
      message: "Native bridge bus is not available",
      details: { path: "window.webkit.messageHandlers.datafn" },
    });
  });
});
