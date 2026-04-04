import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWKWebViewBridgeBus,
  FILEFN_BRIDGE_PROTOCOL,
  type FileFnBridgeEventEnvelope,
} from "../src/index.js";

declare global {
  // eslint-disable-next-line no-var
  var window: Window & typeof globalThis;
}

describe("createWKWebViewBridgeBus", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: Window & typeof globalThis }).window = {
      webkit: undefined,
      __filefnBridgeReceive__: undefined,
    } as Window & typeof globalThis;
  });

  it("fails fast on native-backed mode mismatch", async () => {
    const bus = createWKWebViewBridgeBus();

    await expect(
      bus.request({
        protocol: FILEFN_BRIDGE_PROTOCOL,
        id: "bridge_req_002",
        method: "handshake",
        payload: {
          clientId: "ios-webview-shell",
          mode: "web-owned",
          baseURL: "https://api.example.test/filefn",
        },
      }),
    ).resolves.toEqual({
      protocol: FILEFN_BRIDGE_PROTOCOL,
      id: "bridge_req_002",
      ok: false,
      error: {
        code: "BRIDGE_PROTOCOL_MISMATCH",
        message: "Native-backed mode mismatch",
        details: { expectedMode: "native-backed" },
      },
    });
  });

  it("maps bridge unavailability and timeout to stable responses", async () => {
    const bus = createWKWebViewBridgeBus({ timeoutMs: 5 });

    await expect(
      bus.request({
        protocol: FILEFN_BRIDGE_PROTOCOL,
        id: "bridge_req_unavailable",
        method: "health.check",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "BRIDGE_UNAVAILABLE" },
    });

    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { filefn: { postMessage } } } as never;
    const timeoutBus = createWKWebViewBridgeBus({ timeoutMs: 1 });

    await expect(
      timeoutBus.request({
        protocol: FILEFN_BRIDGE_PROTOCOL,
        id: "bridge_req_timeout",
        method: "health.check",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "BRIDGE_UNAVAILABLE", message: "Native bridge did not respond before timeout" },
    });
  });

  it("delivers responses and subscribed events through the global receiver", async () => {
    const bus = createWKWebViewBridgeBus();
    const receivedEvents: FileFnBridgeEventEnvelope[] = [];
    const unsubscribe = bus.subscribe((event) => receivedEvents.push(event));

    window.webkit = {
      messageHandlers: {
        filefn: {
          postMessage(message: unknown) {
            const request = message as { id: string };
            window.__filefnBridgeReceive__?.({
              protocol: FILEFN_BRIDGE_PROTOCOL,
              event: "upload.progress",
              payload: { uploadID: "upload_001", bytesSent: 8, bytesExpected: 16 },
            });
            window.__filefnBridgeReceive__?.({
              protocol: FILEFN_BRIDGE_PROTOCOL,
              id: request.id,
              ok: true,
              result: { status: "ready" },
            });
          },
        },
      },
    } as never;

    await expect(
      bus.request({
        protocol: FILEFN_BRIDGE_PROTOCOL,
        id: "bridge_req_success",
        method: "health.check",
      }),
    ).resolves.toEqual({
      protocol: FILEFN_BRIDGE_PROTOCOL,
      id: "bridge_req_success",
      ok: true,
      result: { status: "ready" },
    });

    expect(receivedEvents).toEqual([
      {
        protocol: FILEFN_BRIDGE_PROTOCOL,
        event: "upload.progress",
        payload: { uploadID: "upload_001", bytesSent: 8, bytesExpected: 16 },
      },
    ]);
    unsubscribe();
  });
});
