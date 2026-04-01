import { describe, expect, it } from "vitest";
import {
  createBrowserDatafnExtfnBridge,
  createDatafnExtfnAuthority,
  createDatafnExtfnProxyClient,
} from "../src/index.js";

const schema = {
  resources: [
    {
      name: "clip",
      version: 1,
      fields: [
        { name: "title", type: "string", required: false },
        { name: "site", type: "string", required: false },
      ],
    },
  ],
} as const;

describe("@datafn/extfn proxy client", () => {
  it("returns a DatafnClient-compatible proxy surface and proxies query/mutation traffic", async () => {
    const authority = createDatafnExtfnAuthority({
      schema,
      clientId: "authority:demo",
      namespace: "tenant:demo",
    });
    const bridge = authority.createBridge("popup:demo");
    const client = createDatafnExtfnProxyClient(
      {
        schema,
        clientId: "popup:demo",
        namespace: "tenant:demo",
      },
      {
        bridge,
        address: {
          context: "popup",
          surfaceId: "main",
        },
      },
    );

    expect(typeof client.query).toBe("function");
    expect(typeof client.mutate).toBe("function");
    expect(typeof client.transact).toBe("function");
    expect(typeof client.table).toBe("function");
    expect(typeof client.sync.pull).toBe("function");

    await client.mutate({
      resource: "clip",
      version: 1,
      operation: "insert",
      id: "clip:1",
      record: {
        id: "clip:1",
        title: "First clip",
        site: "youtube",
      },
    });

    const result = await client.query({
      resource: "clip",
      version: 1,
      select: ["id", "title", "site"],
    });

    expect(result).toMatchObject({
      data: [
        expect.objectContaining({
          id: "clip:1",
          title: "First clip",
          site: "youtube",
        }),
      ],
    });
  });

  it("rejects outdated authContext options and keeps the current @datafn/client-shaped surface", () => {
    const authority = createDatafnExtfnAuthority({
      schema,
      clientId: "authority:demo",
      namespace: "tenant:demo",
    });

    try {
      createDatafnExtfnProxyClient(
        {
          schema,
          clientId: "popup:demo",
          namespace: "tenant:demo",
          authContext: { userId: "u_1" },
        } as never,
        {
          bridge: authority.createBridge("popup:demo"),
          address: {
            context: "popup",
          },
        },
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: "E_CONFIG_INVALID",
        message:
          "@datafn/extfn option authContext is not part of the current public @datafn/client API.",
      });
      return;
    }

    throw new Error("Expected authContext validation to fail.");
  });

  it("sends callback-runtime bridge requests exactly once", async () => {
    let sendCount = 0;
    const bridge = createBrowserDatafnExtfnBridge({
      address: {
        context: "popup",
        surfaceId: "main",
      },
      browserRuntime: {
        sendMessage(message, callback) {
          sendCount += 1;
          const envelope = message as { requestId: string };
          callback?.({
            v: 1,
            kind: "response",
            requestId: envelope.requestId,
            ok: true,
            result: { ok: true },
          });
        },
      },
    });

    const response = await bridge.request({
      v: 1,
      kind: "request",
      requestId: "req_1",
      namespace: "datafn",
      method: "query",
      source: {
        context: "popup",
        surfaceId: "main",
      },
      target: {
        context: "background",
      },
      payload: {},
    });

    expect(sendCount).toBe(1);
    expect(response).toMatchObject({
      kind: "response",
      requestId: "req_1",
      ok: true,
      result: { ok: true },
    });
  });
});
