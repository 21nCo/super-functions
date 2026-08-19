import { describe, it, expect, vi } from "vitest";
import { createDatafnServer } from "../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../core-types.js";
import { time } from "@datafn/core";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: false },
        { name: "startUnix", type: "number", required: false },
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

  it("applies top-level temporal filters when resources are omitted", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({
      model: "tasks",
      data: {
        id: "t-in-range",
        title: "Daily report",
        startUnix: Date.parse("2026-05-18T12:00:00.000Z"),
      },
      namespace: "datafn",
    });
    await db.create({
      model: "tasks",
      data: {
        id: "t-out-of-range",
        title: "Old report",
        startUnix: Date.parse("2026-05-17T12:00:00.000Z"),
      },
      namespace: "datafn",
    });
    const searchProvider = {
      name: "provider",
      search: vi.fn().mockResolvedValue([]),
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "t-in-range", score: 0.9 },
        { resource: "tasks", id: "t-out-of-range", score: 0.8 },
      ]),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      searchProvider,
    });

    const response = await server.router.handle(new Request(
      "http://localhost/datafn/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "report",
          temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z", {
            timezone: "UTC",
          }),
        }),
      },
    ));
    const result = await response.json() as any;

    expect(result.result.results.map((entry: { id: string }) => entry.id)).toEqual([
      "t-in-range",
    ]);
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
