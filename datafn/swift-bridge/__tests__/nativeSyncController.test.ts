import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATAFN_BRIDGE_PROTOCOL,
  createNativeSyncController,
  createWKWebViewBridgeBus,
} from "../src/index.js";

type BridgeRequest = {
  protocol: string;
  id: string;
  method: string;
  payload?: any;
};

function installSyncHost(
  responder?: (message: BridgeRequest) => unknown,
) {
  const calls: BridgeRequest[] = [];
  const postMessage = vi.fn((message: unknown) => {
    const envelope = message as BridgeRequest;
    calls.push(envelope);

    let response: unknown;
    if (responder) {
      response = responder(envelope);
    } else if (envelope.method === "handshake") {
      response = {
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: envelope.id,
        ok: true,
        result: {
          bridgeVersion: 1,
          schemaHash: envelope.payload.schemaHash,
          namespace: envelope.payload.namespace,
          storageBackend: "coredata",
          syncOwner: "native",
          remoteMode: envelope.payload.remoteMode,
          indexedDbDisabled: true,
          capabilities: ["storage", "remote", "sync", "events", "health"],
        },
      };
    } else {
      response = {
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: envelope.id,
        ok: true,
        result: undefined,
      };
    }

    if (typeof response !== "undefined") {
      window.__datafnBridgeReceive__?.(response);
    }
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

describe("@datafn/swift-bridge native sync controller", () => {
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("TV-BRG-001: handshake succeeds with matching protocol and schema hash", async () => {
    installSyncHost();
    const controller = createNativeSyncController(createWKWebViewBridgeBus());

    await expect(
      controller.handshake({
        schemaHash: "abc123",
        namespace: "org-1:user-1",
        clientId: "device-1",
        remoteMode: "datafn-server",
        remoteProfile: "default",
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        bridgeVersion: 1,
        schemaHash: "abc123",
        namespace: "org-1:user-1",
        storageBackend: "coredata",
        syncOwner: "native",
        remoteMode: "datafn-server",
        indexedDbDisabled: true,
        capabilities: ["storage", "remote", "sync", "events", "health"],
      },
    });
  });

  it("TV-BRG-003N: handshake fails fast when namespace is missing", async () => {
    installSyncHost();
    const controller = createNativeSyncController(createWKWebViewBridgeBus());

    await expect(
      controller.handshake({
        schemaHash: "abc123",
        namespace: "",
        clientId: "device-1",
        remoteMode: "icloud",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "namespace is required",
        details: { path: "payload.namespace" },
      },
    });
  });

  it("TV-BRG-003: schema hash mismatch is surfaced with a stable error code", async () => {
    installSyncHost((message) => ({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: message.id,
      ok: false,
      error: {
        code: "BRIDGE_PROTOCOL_MISMATCH",
        message: "Schema hash mismatch",
        details: { path: "payload.schemaHash" },
      },
    }));
    const controller = createNativeSyncController(createWKWebViewBridgeBus());

    await expect(
      controller.handshake({
        schemaHash: "web-hash",
        namespace: "org-1:user-1",
        clientId: "device-1",
        remoteMode: "icloud",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "BRIDGE_PROTOCOL_MISMATCH",
        message: "Schema hash mismatch",
        details: { path: "payload.schemaHash" },
      },
    });
  });

  it("TV-SYN-001: delegates the native sync lifecycle including schedulePush", async () => {
    const { calls } = installSyncHost();
    const controller = createNativeSyncController(createWKWebViewBridgeBus());

    await controller.start();
    await controller.pullNow();
    await controller.cloneNow();
    await controller.reconcileNow();
    await controller.schedulePush();
    await controller.stop();

    expect(calls.map((call) => call.method)).toEqual([
      "sync.start",
      "sync.pullNow",
      "sync.cloneNow",
      "sync.reconcileNow",
      "sync.schedulePush",
      "sync.stop",
    ]);
  });

  it("forwards bridge events through onEvent and supports teardown", () => {
    installSyncHost();
    const controller = createNativeSyncController(createWKWebViewBridgeBus());
    const handler = vi.fn();
    const unsubscribe = controller.onEvent(handler);

    window.__datafnBridgeReceive__?.({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "sync.status",
      payload: { state: "running" },
    });

    expect(handler).toHaveBeenCalledWith({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "sync.status",
      payload: { state: "running" },
    });

    unsubscribe();
    window.__datafnBridgeReceive__?.({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "sync.status",
      payload: { state: "stopped" },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fails fast when bridge-backed sync delegation is unavailable", async () => {
    (globalThis as any).window = {};
    const controller = createNativeSyncController(createWKWebViewBridgeBus());

    await expect(controller.start()).rejects.toMatchObject({
      code: "BRIDGE_UNAVAILABLE",
      message: "Native bridge bus is not available",
      details: { path: "window.webkit.messageHandlers.datafn" },
    });
  });
});
