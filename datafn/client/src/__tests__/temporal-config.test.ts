import { describe, expect, it } from "vitest";
import { createClientTemporalConfig } from "../temporalConfig.js";

describe("createClientTemporalConfig", () => {
  it("prefers the configured resolver over registry and fallback timezones", () => {
    const config = createClientTemporalConfig(
      {
        timezone: "UTC",
        detectTimezone: () => "Europe/London",
        timezoneResolver: ({ resource }) =>
          resource === "session" ? "America/New_York" : undefined,
      },
      [
        {
          id: "timezoneChange:1:Asia_Kolkata",
          timezone: "Asia/Kolkata",
          effectiveFrom: 1,
          recordedAt: 1,
        },
      ],
    );

    expect(
      config.timezoneResolver?.({ resource: "session", field: "startUnix", instant: 2 }),
    ).toBe("America/New_York");
  });
});
