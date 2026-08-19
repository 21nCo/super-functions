import { describe, expect, it, vi } from "vitest";
import {
  normalizeTemporalQuery,
  createTimezoneResolver,
  resolveTemporalDateParts,
  resolveTemporalBucketValue,
  resolveTemporalPeriodRange,
  time,
} from "../src/index.js";

describe("temporal DFQL helpers", () => {
  it("normalizes timezone-aware day periods into field filters", () => {
    const query = normalizeTemporalQuery({
      resource: "session",
      version: 1,
      temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z", {
        timezone: "Asia/Kolkata",
      }),
    });

    expect(query).toEqual({
      resource: "session",
      version: 1,
      filters: {
        startUnix: {
          $gte: Date.parse("2026-05-17T18:30:00.000Z"),
          $lte: Date.parse("2026-05-18T18:29:59.999Z"),
        },
      },
    });
  });

  it("merges generated temporal filters with existing filters via $and", () => {
    const query = normalizeTemporalQuery({
      resource: "session",
      version: 1,
      filters: { status: "done" },
      temporal: time.month("startUnix", "2026-05-18T12:00:00.000Z", {
        timezone: "Asia/Kolkata",
      }),
    });

    expect(query.filters).toEqual({
      $and: [
        { status: "done" },
        {
          startUnix: {
            $gte: Date.parse("2026-04-30T18:30:00.000Z"),
            $lte: Date.parse("2026-05-31T18:29:59.999Z"),
          },
        },
      ],
    });
  });

  it("uses client temporal defaults for user timezone clauses", () => {
    const query = normalizeTemporalQuery(
      {
        resource: "session",
        version: 1,
        temporal: time.day("startUnix", "2026-05-18T12:00:00.000Z", {
          timezone: "user",
        }),
      },
      { timezone: () => "Asia/Kolkata" },
    );

    expect(query.filters).toEqual({
      startUnix: {
        $gte: Date.parse("2026-05-17T18:30:00.000Z"),
        $lte: Date.parse("2026-05-18T18:29:59.999Z"),
      },
    });
  });

  it("resolves user timezone from historical registry records", () => {
    const resolver = createTimezoneResolver([
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
    ]);

    expect(
      normalizeTemporalQuery(
        {
          resource: "session",
          version: 1,
          temporal: time.day("startUnix", "2026-04-15T12:00:00.000Z", {
            timezone: "user",
          }),
        },
        { timezoneResolver: resolver },
      ).filters,
    ).toEqual({
      startUnix: {
        $gte: Date.parse("2026-04-15T04:00:00.000Z"),
        $lte: Date.parse("2026-04-16T03:59:59.999Z"),
      },
    });
  });

  it("extracts instant date parts in the requested timezone", () => {
    const instant = Date.parse("2026-03-20T03:30:15.123Z");

    expect(resolveTemporalDateParts(instant, "America/New_York")).toEqual({
      year: 2026,
      month: 3,
      day: 19,
      hour: 23,
      minute: 30,
      second: 15,
      millisecond: 123,
    });
    expect(resolveTemporalDateParts(instant, "Asia/Kolkata")).toEqual({
      year: 2026,
      month: 3,
      day: 20,
      hour: 9,
      minute: 0,
      second: 15,
      millisecond: 123,
    });
  });

  it("keeps temporal group clauses and resolves bucket starts", () => {
    const query = normalizeTemporalQuery({
      resource: "session",
      version: 1,
      temporal: time.groupByDay("startUnix", {
        alias: "day",
        timezone: "Asia/Kolkata",
      }),
    });

    expect(query.temporal).toEqual({
      field: "startUnix",
      storage: "unix-ms",
      timezone: "Asia/Kolkata",
      weekStartsOn: 1,
      groupBy: { scale: "day", alias: "day", output: undefined },
    });
    expect(
      resolveTemporalBucketValue(
        { startUnix: Date.parse("2026-05-18T17:00:00.000Z") },
        {
          field: "startUnix",
          alias: "day",
          scale: "day",
          timezone: "Asia/Kolkata",
          storage: "unix-ms",
          output: "iso",
          weekStartsOn: 1,
        },
      ),
    ).toBe("2026-05-17T18:30:00.000Z");
  });

  it("resolves user timezone per record for temporal grouping", () => {
    const resolver = createTimezoneResolver([
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
    ]);

    expect(
      resolveTemporalBucketValue(
        { startUnix: Date.parse("2026-04-15T12:00:00.000Z") },
        {
          field: "startUnix",
          alias: "day",
          scale: "day",
          timezone: "user",
          timezoneResolver: resolver,
          storage: "unix-ms",
          output: "iso",
          weekStartsOn: 1,
        },
      ),
    ).toBe("2026-04-15T04:00:00.000Z");

    expect(
      resolveTemporalBucketValue(
        { startUnix: Date.parse("2026-05-18T17:00:00.000Z") },
        {
          field: "startUnix",
          alias: "day",
          scale: "day",
          timezone: "user",
          timezoneResolver: resolver,
          storage: "unix-ms",
          output: "iso",
          weekStartsOn: 1,
        },
      ),
    ).toBe("2026-05-17T18:30:00.000Z");
  });

  it("can resolve ranges with a deterministic clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    const range = resolveTemporalPeriodRange({ scale: "day" }, "UTC");
    expect(range).toEqual({
      start: Date.parse("2026-05-18T00:00:00.000Z"),
      end: Date.parse("2026-05-18T23:59:59.999Z"),
    });
    vi.useRealTimers();
  });
});
