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
    expect(redacted).toEqual({ values: [1, 2, "[TRUNCATED]"], text: "abc…" });
  });

  it("preserves public authorization discovery metadata", () => {
    expect(redactOAuthValue({
      authorizationServerMetadata: {
        authorization_endpoint: "https://login.example.com/authorize",
        token_endpoint: "https://login.example.com/token",
        token_endpoint_auth_methods_supported: ["none"],
      },
    })).toEqual({
      authorizationServerMetadata: {
        authorization_endpoint: "https://login.example.com/authorize",
        token_endpoint: "https://login.example.com/token",
        token_endpoint_auth_methods_supported: ["none"],
      },
    });
  });

  it("redacts credential-shaped query and fragment values", () => {
    const redacted = redactOAuthValue(
      "https://client.example/callback?api_key=key&password=pass&view=ok#access_token=token&tab=details",
    );
    expect(redacted).toContain("api_key=%5BREDACTED%5D");
    expect(redacted).toContain("password=%5BREDACTED%5D");
    expect(redacted).toContain("view=ok");
    expect(redacted).toContain("access_token=%5BREDACTED%5D");
    expect(redacted).toContain("tab=details");
    expect(redacted).not.toContain("api_key=key");
    expect(redacted).not.toContain("password=pass");
    expect(redacted).not.toContain("access_token=token");
    expect(redactOAuthValue("com.example.app:/callback?code=secret&view=ok")).toBe(
      "com.example.app:/callback?code=%5BREDACTED%5D&view=ok",
    );
  });

  it("redacts credentials inside diagnostic error text", () => {
    const redacted = redactOAuthValue(
      "request failed at https://client.example/callback?api_key=secret#access_token=token; password=hunter2",
    );
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("access_token=token");
    expect(redacted).not.toContain("hunter2");
    expect(redacted.match(/REDACTED/g)).toHaveLength(3);
  });

  it("preserves bounded diagnostic types and detects circular values", () => {
    const circular: Record<string, unknown> = { safe: "visible" };
    circular.self = circular;
    const error = Object.assign(new Error("password=hunter2"), {
      accessToken: "secret",
    });

    expect(redactOAuthValue({
      map: new Map([["access_token", "secret"], ["safe", "visible"]]),
      set: new Set(["visible", "password=hunter2"]),
      date: new Date("2026-08-26T00:00:00.000Z"),
      error,
      circular,
    })).toMatchObject({
      map: {
        type: "Map",
        entries: [["access_token", "[REDACTED]"], ["safe", "visible"]],
      },
      set: {
        type: "Set",
        values: ["visible", "password=[REDACTED]"],
      },
      date: "2026-08-26T00:00:00.000Z",
      error: {
        name: "Error",
        message: "password=[REDACTED]",
        accessToken: "[REDACTED]",
      },
      circular: { safe: "visible", self: "[CIRCULAR]" },
    });
  });
});
