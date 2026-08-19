import { describe, expect, it } from "vitest";
import { createDatafnClient, MemoryStorageAdapter } from "../src/index.js";

const schema = {
  resources: [
    {
      name: "session",
      version: 1,
      fields: [
        { name: "id", type: "string" as const, required: true },
        { name: "startUnix", type: "number" as const, required: true },
      ],
    },
  ],
} as const;

describe("@datafn/client temporal api", () => {
  it("records and resolves historical timezone changes", async () => {
    const client = createDatafnClient({
      schema,
      clientId: "client-temporal",
      storage: new MemoryStorageAdapter(["session"]),
      sync: { mode: "local-only" },
      getTimestamp: () => Date.parse("2026-05-20T00:00:00.000Z"),
      temporal: {
        timezone: "UTC",
        detectTimezone: () => "UTC",
      },
    });

    await client.temporal.recordTimezoneChange({
      timezone: "America/New_York",
      effectiveFrom: Date.parse("2026-01-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-01-01T00:00:00.000Z"),
      source: "manual",
    });
    await client.temporal.recordTimezoneChange({
      timezone: "Asia/Kolkata",
      effectiveFrom: Date.parse("2026-05-01T00:00:00.000Z"),
      recordedAt: Date.parse("2026-05-01T00:00:00.000Z"),
      source: "manual",
    });

    await expect(
      client.temporal.resolveTimezone(Date.parse("2026-04-15T12:00:00.000Z")),
    ).resolves.toBe("America/New_York");
    await expect(
      client.temporal.resolveTimezone(Date.parse("2026-05-18T12:00:00.000Z")),
    ).resolves.toBe("Asia/Kolkata");

    const range = await client.temporal.resolveRange({
      scale: "day",
      at: Date.parse("2026-05-18T12:00:00.000Z"),
    });
    expect(range).toEqual({
      timezone: "Asia/Kolkata",
      start: Date.parse("2026-05-17T18:30:00.000Z"),
      end: Date.parse("2026-05-18T18:29:59.999Z"),
    });

    const syncRange = client.temporal.resolveRangeSync({
      scale: "day",
      at: Date.parse("2026-05-18T12:00:00.000Z"),
    });
    expect(syncRange).toEqual(range);

    expect(
      client.temporal.resolveBucketSync({
        value: Date.parse("2026-05-18T17:00:00.000Z"),
        scale: "day",
        timezone: "user",
        output: "unix-ms",
      }),
    ).toBe(Date.parse("2026-05-17T18:30:00.000Z"));

    const localTimeInput = Date.parse("2026-05-18T00:00:00.000Z");
    const localTimeDate = new Date(localTimeInput);
    const expectedUtcLocalTime = Date.UTC(
      localTimeDate.getFullYear(),
      localTimeDate.getMonth(),
      localTimeDate.getDate(),
      localTimeDate.getHours(),
      localTimeDate.getMinutes(),
      localTimeDate.getSeconds(),
      localTimeDate.getMilliseconds(),
    );
    expect(
      client.temporal.resolveLocalTimeSync(localTimeInput, { timezone: "UTC" }),
    ).toBe(expectedUtcLocalTime);

    await client.destroy();
  });

  it("rejects unsupported timezone identifiers before persisting them", async () => {
    const client = createDatafnClient({
      schema,
      clientId: "client-invalid-timezone",
      storage: new MemoryStorageAdapter(["session"]),
      sync: { mode: "local-only" },
      temporal: {
        timezone: "UTC",
        detectTimezone: () => "UTC",
      },
    });

    await expect(client.temporal.recordTimezoneChange({
      timezone: "Mars/Base",
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Timezone must be a supported IANA timezone identifier",
        details: { path: "timezone" },
      },
    });
    await expect(client.temporal.listTimezoneChanges()).resolves.toEqual([]);

    await client.destroy();
  });
});
