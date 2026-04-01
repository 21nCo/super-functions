import { describe, expect, it } from "vitest";
import {
  createDatafnExtfnAuthority,
  createDatafnExtfnRoutes,
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

describe("@datafn/extfn authority", () => {
  it("starts authority mode in background and exposes all DataFn routes", () => {
    const authority = createDatafnExtfnAuthority({
      schema,
      clientId: "authority:demo",
      namespace: "tenant:demo",
    });

    const routes = createDatafnExtfnRoutes(authority).map((route) => route.method);
    expect(authority.address.context).toBe("background");
    expect(routes).toEqual([
      "query",
      "mutation",
      "transact",
      "seed",
      "clone",
      "pull",
      "push",
      "reconcile",
      "subscribe",
      "unsubscribe",
    ]);
  });

  it("rejects authority mode outside the background context", () => {
    expect(() =>
      createDatafnExtfnAuthority(
        {
          schema,
          clientId: "content:demo",
          namespace: "tenant:demo",
        },
        {
          address: {
            context: "content",
            contentScriptId: "clipper",
          },
        },
      ),
    ).toThrowError();

    try {
      createDatafnExtfnAuthority(
        {
          schema,
          clientId: "content:demo",
          namespace: "tenant:demo",
        },
        {
          address: {
            context: "content",
            contentScriptId: "clipper",
          },
        },
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: "E_CONTEXT_UNAVAILABLE",
        message: "DataFn authority mode is only available in background context.",
      });
    }
  });

  it("emits subscription events through callback runtimes without double dispatch", async () => {
    const authority = createDatafnExtfnAuthority({
      schema,
      clientId: "authority:demo",
      namespace: "tenant:demo",
    });
    let listener:
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void)
      | undefined;
    const sentEvents: unknown[] = [];

    authority.attachBrowserRuntimeBridge({
      sendMessage(message, callback) {
        sentEvents.push(message);
        callback?.(undefined);
      },
      onMessage: {
        addListener(handler) {
          listener = handler;
        },
        removeListener() {},
      },
    });

    const request = {
      v: 1 as const,
      kind: "request" as const,
      requestId: "req_subscribe",
      namespace: "datafn",
      method: "subscribe",
      source: {
        context: "popup" as const,
        surfaceId: "main",
      },
      target: {
        context: "background" as const,
      },
      payload: {},
    };

    await new Promise<void>((resolve, reject) => {
      const handled = listener?.(request, undefined, (response) => {
        try {
          expect(response).toMatchObject({
            ok: true,
            requestId: "req_subscribe",
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      expect(handled).toBe(true);
    });

    await authority.requestMethod("mutation", {
      resource: "clip",
      version: 1,
      operation: "insert",
      id: "clip:2",
      record: {
        id: "clip:2",
        title: "Second clip",
      },
    });

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0]).toMatchObject({
      kind: "event",
      namespace: "datafn",
      event: "subscription",
    });
  });

  it("supports runtimes whose sendMessage depends on the runtime receiver", async () => {
    const authority = createDatafnExtfnAuthority({
      schema,
      clientId: "authority:demo",
      namespace: "tenant:demo",
    });
    let listener:
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void)
      | undefined;
    const runtime = {
      marker: "runtime",
      sendMessage(this: { marker: string }, _message: unknown, callback?: (response: unknown) => void) {
        if (this.marker !== "runtime") {
          throw new Error("runtime receiver lost");
        }
        callback?.(undefined);
      },
      onMessage: {
        addListener(handler: typeof listener) {
          listener = handler;
        },
        removeListener() {},
      },
    };

    authority.attachBrowserRuntimeBridge(runtime);

    const request = {
      v: 1 as const,
      kind: "request" as const,
      requestId: "req_receiver",
      namespace: "datafn",
      method: "subscribe",
      source: {
        context: "popup" as const,
        surfaceId: "main",
      },
      target: {
        context: "background" as const,
      },
      payload: {},
    };

    await expect(
      new Promise<void>((resolve, reject) => {
        const handled = listener?.(request, undefined, (response) => {
          try {
            expect(response).toMatchObject({
              ok: true,
              requestId: "req_receiver",
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        expect(handled).toBe(true);
      }),
    ).resolves.toBeUndefined();
  });
});
