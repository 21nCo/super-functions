import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATAFN_BRIDGE_PROTOCOL,
  createWKWebViewBridgeBus,
} from "../src/index.js";

type BridgeRequest = {
  protocol: string;
  id: string;
  method: string;
  payload?: any;
};

function installBridgeHost(
  responder: (message: BridgeRequest) => unknown,
  handlerName = "datafn",
) {
  const postMessage = vi.fn((message: unknown) => {
    const response = responder(message as BridgeRequest);
    if (typeof response !== "undefined") {
      window.__datafnBridgeReceive__?.(response);
    }
  });

  (globalThis as any).window = {
    webkit: {
      messageHandlers: {
        [handlerName]: { postMessage },
      },
    },
  };

  return { postMessage };
}

describe("@datafn/swift-bridge wkwebview bus", () => {
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("TV-BRG-001: handshake succeeds over the WKWebView message handler bridge", async () => {
    installBridgeHost((message) => ({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: message.id,
      ok: true,
      result: {
        bridgeVersion: 1,
        schemaHash: message.payload.schemaHash,
        namespace: message.payload.namespace,
        storageBackend: "coredata",
        syncOwner: "native",
        remoteMode: message.payload.remoteMode,
        indexedDbDisabled: true,
      },
    }));

    const bus = createWKWebViewBridgeBus();
    await expect(
      bus.request({
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: "req-1",
        method: "handshake",
        payload: {
          schemaHash: "abc123",
          namespace: "org-1:user-1",
          clientId: "device-1",
          remoteMode: "datafn-server",
          remoteProfile: "default",
        },
      }),
    ).resolves.toEqual({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-1",
      ok: true,
      result: {
        bridgeVersion: 1,
        schemaHash: "abc123",
        namespace: "org-1:user-1",
        storageBackend: "coredata",
        syncOwner: "native",
        remoteMode: "datafn-server",
        indexedDbDisabled: true,
      },
    });
  });

  it("TV-BRG-001N: bridge bus returns BRIDGE_UNAVAILABLE when the handler is missing", async () => {
    (globalThis as any).window = {};
    const bus = createWKWebViewBridgeBus();

    await expect(
      bus.request({
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: "req-1",
        method: "handshake",
        payload: {},
      }),
    ).resolves.toEqual({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-1",
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "Native bridge bus is not available",
        details: { path: "window.webkit.messageHandlers.datafn" },
      },
    });
  });

  it("times out pending requests with a stable bridge error", async () => {
    vi.useFakeTimers();
    installBridgeHost(() => undefined);
    const bus = createWKWebViewBridgeBus({ timeoutMs: 10 });

    const pending = bus.request({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-timeout",
      method: "handshake",
      payload: {},
    });

    await vi.advanceTimersByTimeAsync(11);

    await expect(pending).resolves.toEqual({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-timeout",
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "Native bridge did not respond before timeout",
        details: { path: "window.webkit.messageHandlers.datafn" },
      },
    });
  });

  it("TV-BRG-002: unsupported bridge methods are rejected with a stable error code", async () => {
    installBridgeHost(() => undefined);
    const bus = createWKWebViewBridgeBus();

    await expect(
      bus.request({
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: "req-9",
        method: "native.eval" as never,
        payload: { code: "alert(1)" },
      }),
    ).resolves.toEqual({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-9",
      ok: false,
      error: {
        code: "BRIDGE_METHOD_UNSUPPORTED",
        message: "Unsupported bridge method",
        details: { path: "method", method: "native.eval" },
      },
    });
  });

  it("TV-BRG-002N: protocol mismatches are rejected with a stable error code", async () => {
    installBridgeHost(() => undefined);
    const bus = createWKWebViewBridgeBus();

    await expect(
      bus.request({
        protocol: "wrong-protocol" as typeof DATAFN_BRIDGE_PROTOCOL,
        id: "req-10",
        method: "handshake",
        payload: {},
      }),
    ).resolves.toEqual({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      id: "req-10",
      ok: false,
      error: {
        code: "BRIDGE_PROTOCOL_MISMATCH",
        message: "Bridge protocol version mismatch",
        details: { path: "protocol" },
      },
    });
  });

  it("supports event subscription teardown", () => {
    installBridgeHost(() => undefined);
    const bus = createWKWebViewBridgeBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);

    window.__datafnBridgeReceive__?.({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "bridge.ready",
      payload: { ok: true },
    });

    expect(handler).toHaveBeenCalledWith({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "bridge.ready",
      payload: { ok: true },
    });

    unsubscribe();

    window.__datafnBridgeReceive__?.({
      protocol: DATAFN_BRIDGE_PROTOCOL,
      event: "bridge.ready",
      payload: { ok: false },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
