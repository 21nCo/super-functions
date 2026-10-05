import { describe, expect, it } from "vitest";
import { redactAdminOutputValue, redactAdminValue } from "./audit.js";

describe("administration result redaction", () => {
  it("preserves boolean status types without exposing string or object credentials", () => {
    expect(redactAdminOutputValue({
      items: [{ credentialConfigured: true, tokenAvailable: false, credentialRef: "private-reference" }],
      accessToken: "private-token",
      credentials: { token: "nested-private-token" },
    })).toEqual({
      items: [{ credentialConfigured: true, tokenAvailable: false, credentialRef: "[REDACTED]" }],
      accessToken: "[REDACTED]",
      credentials: "[REDACTED]",
    });
  });

  it("keeps explicit output protection and audit/input protection authoritative", () => {
    const statuses = { credentialConfigured: true, tokenAvailable: false };
    expect(redactAdminOutputValue(statuses, ["credentialConfigured"])).toEqual({
      credentialConfigured: "[REDACTED]", tokenAvailable: false,
    });
    expect(redactAdminValue(statuses)).toEqual({
      credentialConfigured: "[REDACTED]", tokenAvailable: "[REDACTED]",
    });
  });
});
