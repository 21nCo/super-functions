import { describe, it, expect, vi } from "vitest";
import { createDatafnServer } from "../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../core-types.js";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: false },
      ],
    },
  ],
  relations: [],
};

function enableNativeSearch(db: any): void {
  db.capabilities.operations.fulltext = true;
}

describe("DatafnServer.search()", () => {
  it("returns provider-backed results", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({
      model: "tasks",
      data: { id: "t1", title: "Quarterly report", status: "active" },
      namespace: "datafn",
    });

    const searchProvider = {
      name: "provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };

    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      searchProvider,
    });

    const result: any = await server.search({ query: "report" });
    expect(result.results[0]).toMatchObject({ id: "t1", resource: "tasks" });
  });

  it("uses DB-native fallback when provider is missing and native support is available", async () => {
    const db = memoryAdapter();
    await db.initialize();
    enableNativeSearch(db);
    await db.create({
      model: "tasks",
      data: { id: "t-native", title: "Native report", status: "active" },
      namespace: "datafn",
    });

    const server = await createDatafnServer({ allowUnknownResources: true, schema, database: db });
    const result: any = await server.search({ query: "report" });
    expect(result.results[0].id).toBe("t-native");
  });

  it("throws canonical unsupported when provider is missing and DB-native search is unavailable", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server = await createDatafnServer({ allowUnknownResources: true, schema, database: db });

    await expect(server.search({ query: "report" })).rejects.toMatchObject({
      code: "DFQL_UNSUPPORTED",
      message: "No search provider configured and DB adapter has no native search support",
    });
  });

  it("throws DFQL_ABORTED for aborted signal", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const searchProvider = {
      name: "provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      searchProvider,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(server.search({ query: "report", signal: controller.signal })).rejects.toMatchObject({
      code: "DFQL_ABORTED",
      message: "Search request aborted",
    });
  });
});
