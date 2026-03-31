import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeBackedStorageAdapter,
  createWKWebViewBridgeBus,
} from "../src/index.js";

type BridgeRequest = {
  protocol: string;
  id: string;
  method: string;
  payload?: any;
};

function installStorageHost() {
  const calls: BridgeRequest[] = [];
  const postMessage = vi.fn((message: unknown) => {
    const envelope = message as BridgeRequest;
    calls.push(envelope);

    let result: unknown;
    switch (envelope.method) {
      case "storage.getRecord":
        result = { id: envelope.payload.id, title: "A", meta: { p: 1 } };
        break;
      case "storage.listRecords":
        result = [{ id: "task:1" }, { id: "task:2" }];
        break;
      case "storage.mergeRecord":
        result = { id: envelope.payload.id, title: "A", meta: { p: 1 } };
        break;
      case "storage.listJoinRows":
      case "storage.getJoinRows":
      case "storage.getJoinRowsInverse":
        result = [{ from: "task:1", to: "tag:1" }];
        break;
      case "storage.findRecords":
        result = [{ id: "task:1" }];
        break;
      case "storage.getCursor":
        result = "cursor-1";
        break;
      case "storage.getHydrationState":
        result = "ready";
        break;
      case "storage.changelogAppend":
        result = { seq: 1, ...envelope.payload.entry };
        break;
      case "storage.changelogList":
        result = [
          {
            seq: 1,
            clientId: "d1",
            mutationId: "m1",
            mutation: { op: "merge" },
            timestampMs: 1,
          },
        ];
        break;
      case "storage.countRecords":
        result = 2;
        break;
      case "storage.countJoinRows":
        result = 1;
        break;
      case "storage.healthCheck":
        result = { ok: true, issues: [] };
        break;
      default:
        result = undefined;
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

  return { calls, postMessage };
}

describe("@datafn/swift-bridge native storage adapter", () => {
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("TV-STO-001: relays core storage operations through the bridge", async () => {
    installStorageHost();
    const storage = createNativeBackedStorageAdapter(createWKWebViewBridgeBus());

    await storage.upsertRecord("tasks", { id: "task:1", title: "A" });
    const record = await storage.mergeRecord("tasks", "task:1", { meta: { p: 1 } });
    const changelogEntry = await storage.changelogAppend({
      clientId: "d1",
      mutationId: "m1",
      mutation: { op: "merge" },
      timestampMs: 1,
    });
    const health = await storage.healthCheck();

    expect(record).toEqual({ id: "task:1", title: "A", meta: { p: 1 } });
    expect(changelogEntry.seq).toBe(1);
    expect(health).toEqual({ ok: true, issues: [] });
  });

  it("implements the full DatafnStorageAdapter bridge method map", async () => {
    const { calls } = installStorageHost();
    const storage = createNativeBackedStorageAdapter(createWKWebViewBridgeBus());

    await storage.getRecord("tasks", "task:1");
    await storage.listRecords("tasks");
    await storage.upsertRecord("tasks", { id: "task:1" });
    await storage.deleteRecord("tasks", "task:1");
    await storage.mergeRecord("tasks", "task:1", { title: "A" });
    await storage.listJoinRows("tasks_tags");
    await storage.getJoinRows("tasks_tags", "task:1");
    await storage.getJoinRowsInverse("tasks_tags", "tag:1");
    await storage.upsertJoinRow("tasks_tags", { from: "task:1", to: "tag:1" });
    await storage.setJoinRows("tasks_tags", [{ from: "task:1", to: "tag:1" }]);
    await storage.deleteJoinRow("tasks_tags", "task:1", "tag:1");
    await storage.findRecords("tasks", "completed", false);
    await storage.getCursor("tasks");
    await storage.setCursor("tasks", "cursor-1");
    await storage.getHydrationState("tasks");
    await storage.setHydrationState("tasks", "ready");
    await storage.changelogAppend({
      clientId: "d1",
      mutationId: "m1",
      mutation: { op: "merge" },
      timestampMs: 1,
    });
    await storage.changelogList({ limit: 10 });
    await storage.changelogAck({ throughSeq: 1 });
    await storage.countRecords("tasks");
    await storage.countJoinRows("tasks_tags");
    await storage.close();
    await storage.clearAll();
    await storage.healthCheck();

    expect(calls.map((call) => call.method)).toEqual([
      "storage.getRecord",
      "storage.listRecords",
      "storage.upsertRecord",
      "storage.deleteRecord",
      "storage.mergeRecord",
      "storage.listJoinRows",
      "storage.getJoinRows",
      "storage.getJoinRowsInverse",
      "storage.upsertJoinRow",
      "storage.setJoinRows",
      "storage.deleteJoinRow",
      "storage.findRecords",
      "storage.getCursor",
      "storage.setCursor",
      "storage.getHydrationState",
      "storage.setHydrationState",
      "storage.changelogAppend",
      "storage.changelogList",
      "storage.changelogAck",
      "storage.countRecords",
      "storage.countJoinRows",
      "storage.close",
      "storage.clearAll",
      "storage.healthCheck",
    ]);
  });

  it("fails fast when the native bridge is unavailable", async () => {
    (globalThis as any).window = {};
    const storage = createNativeBackedStorageAdapter(createWKWebViewBridgeBus());

    await expect(storage.getRecord("tasks", "task:1")).rejects.toMatchObject({
      code: "BRIDGE_UNAVAILABLE",
      message: "Native bridge bus is not available",
      details: { path: "window.webkit.messageHandlers.datafn" },
    });
  });
});
