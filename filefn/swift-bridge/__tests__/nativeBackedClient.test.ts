import { beforeEach, describe, expect, it } from "vitest";
import {
  FileFnBridgeClientError,
  createNativeBackedFileFnClient,
  FILEFN_BRIDGE_PROTOCOL,
  type FileFnBridgeBus,
} from "../src/index.js";

declare global {
  // eslint-disable-next-line no-var
  var window: Window & typeof globalThis;
}

describe("createNativeBackedFileFnClient", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: Window & typeof globalThis }).window = {
      webkit: undefined,
      __filefnBridgeReceive__: undefined,
    } as Window & typeof globalThis;
  });

  it("requires handshake before native-backed requests", async () => {
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

  it("performs handshake and routes file methods over the bridge bus", async () => {
    const requests: Array<{ method: string; payload?: unknown }> = [];
    const bus: FileFnBridgeBus = {
      async request(message) {
        requests.push({ method: message.method, payload: message.payload });
        if (message.method === "handshake") {
          return {
            protocol: FILEFN_BRIDGE_PROTOCOL,
            id: message.id,
            ok: true,
            result: {
              bridgeVersion: 1,
              uploadOwner: "native",
              authOwner: "native",
              previewScheme: "filefn-bridge",
              capabilities: ["files", "uploads"],
            },
          };
        }

        return {
          protocol: FILEFN_BRIDGE_PROTOCOL,
          id: message.id,
          ok: true,
          result: { fileId: "file_001", name: "avatar.png" },
        };
      },
      subscribe() {
        return () => undefined;
      },
    };

    const client = createNativeBackedFileFnClient(
      {
        clientId: "ios-webview-shell",
        mode: "native-backed",
        baseURL: "https://api.example.test/filefn",
      },
      bus,
    );

    await expect(client.handshake()).resolves.toMatchObject({
      bridgeVersion: 1,
      previewScheme: "filefn-bridge",
    });
    await expect(client.getFile("file_001")).resolves.toEqual({
      fileId: "file_001",
      name: "avatar.png",
    });

    expect(requests).toEqual([
      {
        method: "handshake",
        payload: {
          clientId: "ios-webview-shell",
          mode: "native-backed",
          baseURL: "https://api.example.test/filefn",
        },
      },
      {
        method: "file.get",
        payload: { fileId: "file_001" },
      },
    ]);
  });

  it("preserves stable bridge errors and asset-handle upload semantics", async () => {
    const bus: FileFnBridgeBus = {
      async request(message) {
        if (message.method === "handshake") {
          return {
            protocol: FILEFN_BRIDGE_PROTOCOL,
            id: message.id,
            ok: true,
            result: {
              bridgeVersion: 1,
              uploadOwner: "native",
              authOwner: "native",
              previewScheme: "filefn-bridge",
              capabilities: ["uploads"],
            },
          };
        }

        if (message.method === "upload.start") {
          if (!(message.payload as { assetHandle?: string }).assetHandle) {
            return {
              protocol: FILEFN_BRIDGE_PROTOCOL,
              id: message.id,
              ok: false,
              error: {
                code: "BRIDGE_INVALID_SOURCE",
                message: "Native-backed uploads require assetHandle",
              },
            };
          }

          return {
            protocol: FILEFN_BRIDGE_PROTOCOL,
            id: message.id,
            ok: true,
            result: {
              uploadID: "upload_native_001",
              fileId: "file_native_001",
            },
          };
        }

        return {
          protocol: FILEFN_BRIDGE_PROTOCOL,
          id: message.id,
          ok: true,
          result: { ok: true },
        };
      },
      subscribe() {
        return () => undefined;
      },
    };

    const client = createNativeBackedFileFnClient(
      {
        clientId: "ios-webview-shell",
        mode: "native-backed",
        baseURL: "https://api.example.test/filefn",
      },
      bus,
    );
    await client.handshake();

    await expect(
      client.startUpload({
        policy: "public-image",
      }),
    ).rejects.toEqual(
      new FileFnBridgeClientError(
        "BRIDGE_INVALID_SOURCE",
        "Native-backed uploads require assetHandle",
      ),
    );

    await expect(
      client.startUpload({
        policy: "public-image",
        assetHandle: "asset_001",
        background: true,
      }),
    ).resolves.toEqual({
      uploadID: "upload_native_001",
      fileId: "file_native_001",
    });
  });
});
