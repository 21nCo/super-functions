import { describe, expect, it } from "vitest";

import { redactOAuthValue } from "../index.js";

describe("OAuth diagnostics redaction", () => {
  it("redacts nested credentials and sensitive URL parameters", () => {
    expect(redactOAuthValue({
      accessToken: "access-secret",
      nested: {
        code_verifier: "verifier",
        state: "state-secret",
        apiKey: "api-key-secret",
        safe: "visible",
      },
      url: "https://client.example/callback?code=secret&state=secret-state&view=ok",
    })).toEqual({
      accessToken: "[REDACTED]",
      nested: {
        code_verifier: "[REDACTED]",
        state: "[REDACTED]",
        apiKey: "[REDACTED]",
        safe: "visible",
      },
      url: "https://client.example/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D&view=ok",
    });
  });

  it("bounds diagnostic collections and strings", () => {
    const redacted = redactOAuthValue({ values: [1, 2, 3], text: "abcdef" }, {
      maxArrayEntries: 2,
      maxStringLength: 3,
    });
    expect(redacted).toEqual({ values: [1, 2], text: "abc…" });
  });
});
