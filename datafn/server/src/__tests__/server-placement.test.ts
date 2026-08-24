import type { IndexedDirectoryRecord, IndexedDirectoryStoreAdapter } from "@superfunctions/db";
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
    const server = await createDatafnServer({
      schema: { resources: [] },
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
});
