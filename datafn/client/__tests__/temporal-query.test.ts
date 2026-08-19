import { describe, expect, it } from "vitest";
import { TIMEZONE_CHANGE_RESOURCE_NAME, time } from "../src/index.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import { executeLocalQuery } from "../src/offline/query.js";

const schema = {
  resources: [
    {
      name: "session",
      version: 1,
      fields: [
        { name: "id", type: "string" as const, required: true },
        { name: "startUnix", type: "number" as const, required: true },
        { name: "minutes", type: "number" as const, required: true },
      ],
    },
  ],
} as const;

describe("@datafn/client temporal query execution", () => {
  it("filters local records using temporal periods", async () => {
    const storage = new MemoryStorageAdapter(["session"]);
    await storage.upsertRecord(TIMEZONE_CHANGE_RESOURCE_NAME, {
      id: "timezoneChange:1:Asia_Kolkata",
      timezone: "Asia/Kolkata",
      effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    await storage.upsertRecord("session", {
      id: "session:1",
      startUnix: Date.parse("2026-05-17T19:00:00.000Z"),
      minutes: 10,
    });
    await storage.upsertRecord("session", {
      id: "session:2",
      startUnix: Date.parse("2026-05-18T17:00:00.000Z"),
      minutes: 20,
    });
    await storage.upsertRecord("session", {
      id: "session:3",
      startUnix: Date.parse("2026-05-18T19:00:00.000Z"),
      minutes: 30,
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "session",
      version: 1,
      temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z", {
        timezone: "user",
      }),
      sort: ["id:asc"],
    });

    expect(result.data?.map((row) => row.id)).toEqual(["session:1", "session:2"]);
  });

  it("uses the client default user timezone when temporal clauses omit timezone", async () => {
    const storage = new MemoryStorageAdapter(["session"]);
    await storage.upsertRecord(TIMEZONE_CHANGE_RESOURCE_NAME, {
      id: "timezoneChange:1:Asia_Kolkata",
      timezone: "Asia/Kolkata",
      effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    await storage.upsertRecord("session", {
      id: "session:1",
      startUnix: Date.parse("2026-05-17T19:00:00.000Z"),
      minutes: 10,
    });
    await storage.upsertRecord("session", {
      id: "session:2",
      startUnix: Date.parse("2026-05-18T17:00:00.000Z"),
      minutes: 20,
    });
    await storage.upsertRecord("session", {
      id: "session:3",
      startUnix: Date.parse("2026-05-18T19:00:00.000Z"),
      minutes: 30,
    });

    const result = await executeLocalQuery(
      storage,
      schema,
      {
        resource: "session",
        version: 1,
        temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z"),
        sort: ["id:asc"],
      },
      undefined,
      { timezone: "user" },
    );

    expect(result.data?.map((row) => row.id)).toEqual(["session:1", "session:2"]);
  });

  it("groups local aggregates by timezone-aware temporal buckets", async () => {
    const storage = new MemoryStorageAdapter(["session"]);
    await storage.upsertRecord(TIMEZONE_CHANGE_RESOURCE_NAME, {
      id: "timezoneChange:1:America_New_York",
      timezone: "America/New_York",
      effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    await storage.upsertRecord(TIMEZONE_CHANGE_RESOURCE_NAME, {
      id: "timezoneChange:2:Asia_Kolkata",
      timezone: "Asia/Kolkata",
      effectiveFrom: Date.parse("2026-05-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-05-01T00:00:00.000Z"),
    });
    await storage.upsertRecord("session", {
      id: "session:1",
      startUnix: Date.parse("2026-05-17T19:00:00.000Z"),
      minutes: 10,
    });
    await storage.upsertRecord("session", {
      id: "session:2",
      startUnix: Date.parse("2026-05-18T17:00:00.000Z"),
      minutes: 20,
    });
    await storage.upsertRecord("session", {
      id: "session:3",
      startUnix: Date.parse("2026-05-18T19:00:00.000Z"),
      minutes: 30,
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "session",
      version: 1,
      temporal: time.groupByDay("startUnix", {
        alias: "day",
        timezone: "user",
      }),
      aggregations: {
        count: { op: "count", field: "*" },
        minutes: { op: "sum", field: "minutes" },
      },
    });

    expect(result.groups).toEqual([
      {
        day: "2026-05-17T18:30:00.000Z",
        count: 2,
        minutes: 30,
      },
      {
        day: "2026-05-18T18:30:00.000Z",
        count: 1,
        minutes: 30,
      },
    ]);
  });
});
