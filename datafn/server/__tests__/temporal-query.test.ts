import { describe, expect, it } from "vitest";
import { TIMEZONE_CHANGE_RESOURCE_NAME, time } from "@datafn/core";
import { executeQuery } from "../src/execution/query/execute.js";
import type { DataStore } from "../src/execution/store.js";

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

function createStore(
  records: Record<string, unknown>[],
  timezoneChanges: Record<string, unknown>[] = [],
): DataStore {
  return {
    getRecords(resource: string) {
      if (resource === TIMEZONE_CHANGE_RESOURCE_NAME) return timezoneChanges;
      return resource === "session" ? records : [];
    },
    getRecord(resource: string, id: string) {
      return resource === "session"
        ? records.find((record) => record.id === id) ?? null
        : null;
    },
    getJoinRows() {
      return [];
    },
    findRecords(resource: string, field: string, value: unknown) {
      return resource === "session"
        ? records.filter((record) => record[field] === value)
        : [];
    },
  };
}

describe("@datafn/server temporal query execution", () => {
  it("filters records by timezone-aware temporal periods", () => {
    const store = createStore(
      [
        {
          id: "session:1",
          startUnix: Date.parse("2026-05-17T19:00:00.000Z"),
          minutes: 10,
        },
        {
          id: "session:2",
          startUnix: Date.parse("2026-05-18T17:00:00.000Z"),
          minutes: 20,
        },
        {
          id: "session:3",
          startUnix: Date.parse("2026-05-18T19:00:00.000Z"),
          minutes: 30,
        },
      ],
      [
        {
          id: "timezoneChange:1:Asia_Kolkata",
          timezone: "Asia/Kolkata",
          effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
          recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
        },
      ],
    );

    const result = executeQuery(
      {
        resource: "session",
        version: 1,
        temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z", {
          timezone: "user",
        }),
        sort: ["id:asc"],
      },
      schema,
      store,
    );

    expect("data" in result ? result.data.map((record) => record.id) : []).toEqual([
      "session:1",
      "session:2",
    ]);
  });

  it("groups aggregate rows by timezone-aware temporal buckets", () => {
    const store = createStore(
      [
        {
          id: "session:1",
          startUnix: Date.parse("2026-05-17T19:00:00.000Z"),
          minutes: 10,
        },
        {
          id: "session:2",
          startUnix: Date.parse("2026-05-18T17:00:00.000Z"),
          minutes: 20,
        },
        {
          id: "session:3",
          startUnix: Date.parse("2026-05-18T19:00:00.000Z"),
          minutes: 30,
        },
      ],
      [
        {
          id: "timezoneChange:1:America_New_York",
          timezone: "America/New_York",
          effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
          recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "timezoneChange:2:Asia_Kolkata",
          timezone: "Asia/Kolkata",
          effectiveFrom: Date.parse("2026-05-01T00:00:00.000Z"),
          recordedAt: Date.parse("2026-05-01T00:00:00.000Z"),
        },
      ],
    );

    const result = executeQuery(
      {
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
      },
      schema,
      store,
    );

    expect("groups" in result ? result.groups : []).toEqual([
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
