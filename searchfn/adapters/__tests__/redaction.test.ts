import { describe, expect, it } from "vitest";
import { redactSensitive } from "../src/internal/redaction";

describe("shared adapter redaction", () => {
  it("redacts suffixed connection secret keys without over-redacting unrelated fields", () => {
    expect(
      redactSensitive({
        pgConnectionString: "postgres://user:pass@example.test/app",
        dbConnection: "postgres://user:pass@example.test/app",
        connectionTimeout: 5000,
      }),
    ).toEqual({
      pgConnectionString: "[REDACTED]",
      dbConnection: "[REDACTED]",
      connectionTimeout: 5000,
    });
  });
});
