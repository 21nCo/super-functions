import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeBackedSearchProvider,
  createWKWebViewBridgeBus,
} from "../src/index.js";

type BridgeRequest = {
  protocol: string;
  id: string;
  method: string;
  payload?: any;
};

function installSearchHost(
  responder?: (message: BridgeRequest) => unknown,
) {
  const calls: BridgeRequest[] = [];
  const postMessage = vi.fn((message: unknown) => {
    const envelope = message as BridgeRequest;
    calls.push(envelope);

    let response: unknown;
    if (responder) {
      response = responder(envelope);
    } else {
      switch (envelope.method) {
        case "search.initialize":
          response = {
            protocol: envelope.protocol,
            id: envelope.id,
            ok: true,
            result: { initialized: true },
          };
          break;
        case "search.search":
          response = {
            protocol: envelope.protocol,
            id: envelope.id,
            ok: true,
            result: { ids: ["td-1"] },
          };
          break;
        case "search.searchAll":
          response = {
            protocol: envelope.protocol,
            id: envelope.id,
            ok: true,
            result: {
              results: [{ resource: "todos", id: "td-1", score: 1 }],
            },
          };
          break;
        default:
          response = {
            protocol: envelope.protocol,
            id: envelope.id,
            ok: true,
            result: undefined,
          };
          break;
      }
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

describe("@datafn/swift-bridge native search provider", () => {
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("TV-DFS-002: initializes native search resources over the bridge", async () => {
    const { calls } = installSearchHost();
    const provider = createNativeBackedSearchProvider(createWKWebViewBridgeBus());

    await provider.initialize?.({
      resources: [
        { name: "todos", searchFields: ["text"] },
        { name: "categories", searchFields: ["name"] },
        { name: "audit", searchFields: [] },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "search.initialize",
      payload: {
        resources: [
          { name: "todos", searchFields: ["text"] },
          { name: "categories", searchFields: ["name"] },
        ],
      },
    });
  });

  it("TV-DFS-002N: rejects duplicate native search resources with DFQL_INVALID", async () => {
    installSearchHost();
    const provider = createNativeBackedSearchProvider(createWKWebViewBridgeBus());

    await expect(
      provider.initialize?.({
        resources: [
          { name: "todos", searchFields: ["text"] },
          { name: " Todos ", searchFields: ["text"] },
        ],
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      details: { path: "resources" },
    });
  });

  it("TV-DFS-003: routes native-backed search and searchAll over the bridge", async () => {
    const { calls } = installSearchHost();
    const provider = createNativeBackedSearchProvider(createWKWebViewBridgeBus());

    await expect(
      provider.search({
        resource: "todos",
        query: "milk",
        limit: 10,
      }),
    ).resolves.toEqual(["td-1"]);

    await expect(
      provider.searchAll?.({
        query: "milk",
        resources: ["todos"],
        limit: 10,
      }),
    ).resolves.toEqual([{ resource: "todos", id: "td-1", score: 1 }]);

    await provider.updateIndices({
      resource: "todos",
      records: [{ id: "td-1", text: "buy milk" }],
      operation: "upsert",
    });
    await provider.dispose?.();

    expect(calls.map((call) => call.method)).toEqual([
      "search.search",
      "search.searchAll",
      "search.dispose",
    ]);
  });

  it("TV-DFS-003N and TV-DFS-008: bridge unavailability is remapped to NATIVE_BRIDGE_UNAVAILABLE", async () => {
    (globalThis as any).window = {};
    const provider = createNativeBackedSearchProvider(createWKWebViewBridgeBus());

    await expect(
      provider.search({
        resource: "todos",
        query: "milk",
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_BRIDGE_UNAVAILABLE",
      message: "Native bridge bus is not available",
      details: { path: "window.webkit.messageHandlers.datafn" },
    });
  });

  it("passes through native search backend failures without remapping them away", async () => {
    installSearchHost((message) => ({
      protocol: message.protocol,
      id: message.id,
      ok: false,
      error: {
        code: "NATIVE_SEARCH_UNAVAILABLE",
        message: "Native search backend is rebuilding",
        details: { path: "search.state" },
      },
    }));
    const provider = createNativeBackedSearchProvider(createWKWebViewBridgeBus());

    await expect(
      provider.search({
        resource: "todos",
        query: "milk",
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_SEARCH_UNAVAILABLE",
      details: { path: "search.state" },
    });
  });
});
