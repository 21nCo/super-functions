import type { IndexedDirectoryRecord, IndexedDirectoryStoreAdapter } from "@superfunctions/db";
import { memoryAdapter } from "@superfunctions/db/testing";
import { describe, expect, it, vi } from "vitest";

import {
  claimDatafnNamespacePlacement,
  createMemoryDatafnPlacementDirectory,
} from "../multi-region-routing.js";
import { datafnMultiRegionPlugin } from "../plugins/multi-region.js";
import { createDatafnServer } from "../server.js";

function permissionDirectory(): IndexedDirectoryStoreAdapter {
  const records = new Map<string, IndexedDirectoryRecord>();
  return {
    async get(key) { return records.get(key) ?? null; },
    async put(record) { records.set(record.key, record); },
    async putIfAbsent(record) {
      const existing = records.get(record.key);
      if (existing) return { inserted: false, existing };
      records.set(record.key, record);
      return { inserted: true };
    },
    async update(record) { records.set(record.key, record); return record; },
    async delete(key) { records.delete(key); },
    async query() { return { records: [] }; },
  };
}

describe("DataFn server placement integration", () => {
  it("checks placement before plugin/application authorization and database execution", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:one",
      regionId: "us",
    });
    const authorize = vi.fn(() => true);
    const pluginAuthorize = vi.fn(() => true);
    const database = memoryAdapter();
    const create = vi.spyOn(database, "create");
    const server = await createDatafnServer({
      schema: {
        version: 1,
        resources: [{
          name: "note",
          version: 1,
          fields: [{ name: "title", type: "string", required: false }],
        }],
        relations: [],
      },
      database,
      context: { namespace: "tenant:one" },
      namespaceProvider: {
        getNamespace: (context: { namespace: string }) => context.namespace,
      },
      plugins: [
        datafnMultiRegionPlugin({
          regionId: "eu",
          directory: permissionDirectory(),
          placement: { directory: placement },
        }),
        { name: "side-effecting-auth", runsOn: ["server"], authorize: pluginAuthorize },
      ] as any,
      authorize,
    });

    try {
      const response = await server.router.handle(new Request("https://cell.internal/datafn/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "create", resource: "note", data: {} }),
      }));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "DATAFN_REGION_MISMATCH",
          details: { executionStarted: false },
        },
      });
      expect(pluginAuthorize).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("requires the routed WebSocket handshake and fences pinned epochs", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:one",
      regionId: "eu",
    });
    const server = await createDatafnServer({
      schema: { resources: [] },
      plugins: [datafnMultiRegionPlugin({
        regionId: "eu",
        directory: permissionDirectory(),
        placement: { directory: placement },
      })],
    });
    const client = { send: vi.fn(), close: vi.fn() };

    try {
      expect(server.websocketHandler.addClient(client, { namespace: "tenant:one" })).toBe(false);
      expect(client.close).toHaveBeenCalledWith(
        4409,
        "Placement validation required; use addRoutedClient",
      );
      client.close.mockClear();
      await expect(server.websocketHandler.addRoutedClient(
        client,
        { namespace: "tenant:one" },
      )).resolves.toBe(true);
      expect(server.websocketHandler.fenceNamespace("tenant:one", 2)).toBe(1);
      expect(client.close).toHaveBeenCalledWith(
        4510,
        "DATAFN_REGION_MISMATCH: reconnect through canonical gateway",
      );
    } finally {
      await server.close();
    }
  });

  it("rejects routed WebSocket clients that cannot be closed by the transport", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:one",
      regionId: "eu",
    });
    const server = await createDatafnServer({
      schema: { resources: [] },
      plugins: [datafnMultiRegionPlugin({
        regionId: "eu",
        directory: permissionDirectory(),
        placement: { directory: placement },
      })],
    });
    try {
      await expect(server.websocketHandler.addRoutedClient(
        { send: vi.fn() },
        { namespace: "tenant:one" },
      )).resolves.toBe(false);
      expect(server.websocketHandler.fenceNamespace("tenant:one")).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("rejects a routed WebSocket when a namespace fence lands during validation", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:one",
      regionId: "eu",
    });
    let releaseRead!: () => void;
    const blockedRead = new Promise<void>((resolve) => { releaseRead = resolve; });
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
    const directory = {
      ...placement,
      async get(namespace: string) {
        markReadStarted();
        await blockedRead;
        return placement.get(namespace);
      },
    };
    const server = await createDatafnServer({
      schema: { resources: [] },
      plugins: [datafnMultiRegionPlugin({
        regionId: "eu",
        directory: permissionDirectory(),
        placement: { directory },
      })],
    });
    const client = {
      send: vi.fn(),
      close: vi.fn(() => { throw new Error("transport close failed"); }),
    };

    try {
      const admission = server.websocketHandler.addRoutedClient(
        client,
        { namespace: "tenant:one" },
      );
      await readStarted;
      expect(server.websocketHandler.fenceNamespace("tenant:one")).toBe(0);
      releaseRead();
      await expect(admission).resolves.toBe(false);
      expect(client.close).toHaveBeenCalledWith(
        4510,
        "DATAFN_REGION_MISMATCH: reconnect through canonical gateway",
      );
    } finally {
      releaseRead();
      await server.close();
    }
  });

  it("rejects a routed WebSocket when shutdown lands during validation", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:one",
      regionId: "eu",
    });
    let releaseRead!: () => void;
    const blockedRead = new Promise<void>((resolve) => { releaseRead = resolve; });
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
    const directory = {
      ...placement,
      async get(namespace: string) {
        markReadStarted();
        await blockedRead;
        return placement.get(namespace);
      },
    };
    const server = await createDatafnServer({
      schema: { resources: [] },
      plugins: [datafnMultiRegionPlugin({
        regionId: "eu",
        directory: permissionDirectory(),
        placement: { directory },
      })],
    });
    const client = { send: vi.fn(), close: vi.fn() };

    try {
      const admission = server.websocketHandler.addRoutedClient(
        client,
        { namespace: "tenant:one" },
      );
      await readStarted;
      await server.close();
      releaseRead();
      await expect(admission).resolves.toBe(false);
      expect(client.close).toHaveBeenCalledWith(1001, "Going Away");
    } finally {
      releaseRead();
      await server.close();
    }
  });

  it("keeps health status available without a tenant placement", async () => {
    const server = await createDatafnServer({
      schema: { resources: [] },
      context: { namespace: "unclaimed" },
      namespaceProvider: {
        getNamespace: (context: { namespace: string }) => context.namespace,
      },
      plugins: [datafnMultiRegionPlugin({
        regionId: "eu",
        directory: permissionDirectory(),
        placement: { directory: createMemoryDatafnPlacementDirectory() },
      })],
    });
    try {
      const response = await server.router.handle(
        new Request("https://cell.internal/datafn/status"),
      );
      expect(response.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("passes an unread request body to a custom route after placement resolution", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:plugin",
      regionId: "eu",
    });
    const server = await createDatafnServer({
      schema: { resources: [] },
      database: memoryAdapter(),
      plugins: [
        datafnMultiRegionPlugin({
          regionId: "eu",
          directory: permissionDirectory(),
          placement: { directory: placement },
        }),
        {
          name: "body-route",
          runsOn: ["server"],
          routes: () => [{
            method: "POST",
            path: "/plugin/body",
            meta: {
              datafnPlacement: {
                resolveNamespace: async (request: Request) => {
                  const body = await request.json() as { namespace: string };
                  return body.namespace;
                },
              },
            },
            handler: async (request: Request) => new Response(await request.text()),
          }],
        },
      ] as any,
    });
    const body = JSON.stringify({ namespace: "tenant:plugin", value: "preserved" });
    try {
      const response = await server.router.handle(new Request(
        "https://cell.internal/plugin/body",
        { method: "POST", body },
      ));
      expect(await response.text()).toBe(body);
    } finally {
      await server.close();
    }
  });

  it("checks placement before custom route middleware", async () => {
    const placement = createMemoryDatafnPlacementDirectory();
    await claimDatafnNamespacePlacement({
      directory: placement,
      namespace: "tenant:plugin",
      regionId: "us",
    });
    const middleware = vi.fn(async (
      _request: Request,
      _context: unknown,
      next: () => Promise<Response>,
    ) => next());
    const handler = vi.fn(async () => new Response("unexpected"));
    const server = await createDatafnServer({
      schema: { resources: [] },
      database: memoryAdapter(),
      plugins: [
        datafnMultiRegionPlugin({
          regionId: "eu",
          directory: permissionDirectory(),
          placement: { directory: placement },
        }),
        {
          name: "middleware-route",
          runsOn: ["server"],
          routes: () => [{
            method: "POST",
            path: "/plugin/middleware",
            meta: {
              datafnPlacement: {
                resolveNamespace: async () => "tenant:plugin",
              },
            },
            middleware: [middleware],
            handler,
          }],
        },
      ] as any,
    });

    try {
      const response = await server.router.handle(new Request(
        "https://cell.internal/plugin/middleware",
        { method: "POST" },
      ));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "DATAFN_REGION_MISMATCH" },
      });
      expect(middleware).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("bounds a custom-route body before namespace resolution", async () => {
    const resolveNamespace = vi.fn(async () => "tenant:plugin");
    const handler = vi.fn(async () => new Response("unexpected"));
    const server = await createDatafnServer({
      schema: { resources: [] },
      database: memoryAdapter(),
      plugins: [
        datafnMultiRegionPlugin({
          regionId: "eu",
          directory: permissionDirectory(),
          placement: {
            directory: createMemoryDatafnPlacementDirectory(),
            maxBodyBytes: 4,
          },
        }),
        {
          name: "bounded-body-route",
          runsOn: ["server"],
          routes: () => [{
            method: "POST",
            path: "/plugin/bounded-body",
            meta: { datafnPlacement: { resolveNamespace } },
            handler,
          }],
        },
      ] as any,
    });

    try {
      const response = await server.router.handle(new Request(
        "https://cell.internal/plugin/bounded-body",
        { method: "POST", body: "12345" },
      ));
      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "DATAFN_PAYLOAD_TOO_LARGE" },
      });
      expect(resolveNamespace).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("rejects assertion runtimes without a verifier and replay store at startup", () => {
    const directory = createMemoryDatafnPlacementDirectory();
    expect(() => datafnMultiRegionPlugin({
      regionId: "eu",
      directory: permissionDirectory(),
      placement: { directory, requireRoutingAssertion: true },
    })).toThrow("DATAFN_ROUTING_ASSERTION_VERIFIER_REQUIRED");
    expect(() => datafnMultiRegionPlugin({
      regionId: "eu",
      directory: permissionDirectory(),
      placement: {
        directory,
        assertionVerifier: { verify: () => { throw new Error("unused"); } },
      },
    })).toThrow("DATAFN_ROUTING_REPLAY_STORE_REQUIRED");
    expect(() => datafnMultiRegionPlugin({
      regionId: "eu",
      directory: permissionDirectory(),
      placement: { directory, maxBodyBytes: -1 },
    })).toThrow("DATAFN_ROUTING_MAX_BODY_BYTES_INVALID");
  });
});
