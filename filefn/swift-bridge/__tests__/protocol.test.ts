import { describe, expect, it } from "vitest";
import {
  FILEFN_BRIDGE_EVENT_NAMES,
  FILEFN_BRIDGE_METHODS,
  FILEFN_BRIDGE_PROTOCOL,
  FileFnBridgeClientError,
  createBridgeErrorResponse,
  createNativeBackedFileFnClient,
  createWKWebViewBridgeBus,
  isBridgeEventEnvelope,
  isBridgeHandshakePayload,
  isBridgeHandshakeResult,
  isBridgeResponseEnvelope,
  isFileFnBridgeMethod,
} from "../src/index.js";

describe("@filefn/swift-bridge protocol scaffold", () => {
  it("exposes the canonical protocol constants", () => {
    expect(FILEFN_BRIDGE_PROTOCOL).toBe("filefn-bridge/v1");
    expect(FILEFN_BRIDGE_METHODS).toContain("handshake");
    expect(FILEFN_BRIDGE_METHODS).toContain("upload.start");
    expect(FILEFN_BRIDGE_EVENT_NAMES).toContain("bridge.ready");
    expect(FILEFN_BRIDGE_EVENT_NAMES).toContain("upload.completed");
    expect(isFileFnBridgeMethod("handshake")).toBe(true);
    expect(isFileFnBridgeMethod("not-a-method")).toBe(false);
  });

  it("creates stable bridge error responses", () => {
    expect(
      createBridgeErrorResponse(
        "bridge_req_001",
        "BRIDGE_UNAVAILABLE",
        "Native bridge bus is not available",
        { path: "window.webkit.messageHandlers.filefn" },
      ),
    ).toEqual({
      protocol: "filefn-bridge/v1",
      id: "bridge_req_001",
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        message: "Native bridge bus is not available",
        details: { path: "window.webkit.messageHandlers.filefn" },
      },
    });
  });

  it("detects response and event envelopes", () => {
    expect(
      isBridgeResponseEnvelope({
        protocol: "filefn-bridge/v1",
        id: "bridge_req_002",
        ok: true,
        result: { bridgeVersion: 1 },
      }),
    ).toBe(true);

    expect(
      isBridgeEventEnvelope({
        protocol: "filefn-bridge/v1",
        event: "bridge.ready",
        payload: { bridgeVersion: 1 },
      }),
    ).toBe(true);
  });

  it("detects handshake payload and result shapes", () => {
    expect(
      isBridgeHandshakePayload({
        clientId: "ios-webview-shell",
        mode: "native-backed",
        baseURL: "https://api.example.test/filefn",
      }),
    ).toBe(true);

    expect(
      isBridgeHandshakeResult({
        bridgeVersion: 1,
        uploadOwner: "native",
        authOwner: "native",
        previewScheme: "filefn-bridge",
        capabilities: ["files", "uploads"],
      }),
    ).toBe(true);
  });

  it("fails fast when native-backed mode is not selected", async () => {
    const bus = createWKWebViewBridgeBus();

    await expect(
      bus.request({
        protocol: "filefn-bridge/v1",
        id: "bridge_req_002",
        method: "handshake",
        payload: {
          clientId: "ios-webview-shell",
          mode: "web-owned",
          baseURL: "https://api.example.test/filefn",
        },
      }),
    ).resolves.toEqual({
      protocol: "filefn-bridge/v1",
      id: "bridge_req_002",
      ok: false,
      error: {
        code: "BRIDGE_PROTOCOL_MISMATCH",
        message: "Native-backed mode mismatch",
        details: { expectedMode: "native-backed" },
      },
    });
  });

  it("requires handshake before native-backed method calls", async () => {
    const client = createNativeBackedFileFnClient({
      clientId: "ios-webview-shell",
      mode: "native-backed",
      baseURL: "https://api.example.test/filefn",
    });

    await expect(client.healthCheck()).rejects.toEqual(
      new FileFnBridgeClientError(
        "BRIDGE_HANDSHAKE_REQUIRED",
        "handshake must complete before native-backed requests",
      ),
    );
  });
});
