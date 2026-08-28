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
        "x-api-key": "prefixed-api-key-secret",
        safe: "visible",
      },
      url: "https://client.example/callback?code=secret&state=secret-state&x-api-key=prefixed-api-key-secret&view=ok",
    })).toEqual({
      accessToken: "[REDACTED]",
      nested: {
        code_verifier: "[REDACTED]",
        state: "[REDACTED]",
        apiKey: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        safe: "visible",
      },
      url: "https://client.example/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D&x-api-key=%5BREDACTED%5D&view=ok",
    });
  });

  it("bounds diagnostic collections and strings", () => {
    const redacted = redactOAuthValue({ values: [1, 2, 3], text: "abcdef" }, {
      maxArrayEntries: 2,
      maxStringLength: 3,
    });
    expect(redacted).toEqual({ values: [1, 2, "[TRUNCATED]"], text: "abc…" });
  });

  it("bounds plain-object entries before reading values beyond the cap", () => {
    const value = {
      first: 1,
      second: 2,
      get third(): never {
        throw new Error("object value read beyond the cap");
      },
    };
    expect(redactOAuthValue(value, { maxObjectEntries: 2 })).toEqual({
      first: 1,
      second: 2,
      "[TRUNCATED]": "[TRUNCATED]",
    });
  });

  it("does not overwrite a retained key when adding the truncation marker", () => {
    expect(redactOAuthValue({
      "[TRUNCATED]": "retained",
      first: 1,
      second: 2,
    }, { maxObjectEntries: 2 })).toEqual({
      "[TRUNCATED]": "retained",
      first: 1,
      "[TRUNCATED_1]": "[TRUNCATED]",
    });
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

  it("redacts credential-shaped query values and removes fragments", () => {
    const redacted = redactOAuthValue(
      "https://client.example/callback?api_key=key&password=pass&view=ok#access_token=token&tab=details",
    );
    expect(redacted).toContain("api_key=%5BREDACTED%5D");
    expect(redacted).toContain("password=%5BREDACTED%5D");
    expect(redacted).toContain("view=ok");
    expect(redacted).not.toContain("#");
    expect(redacted).not.toContain("api_key=key");
    expect(redacted).not.toContain("password=pass");
    expect(redacted).not.toContain("access_token=token");
    expect(redactOAuthValue("https://client.example/callback#raw-secret")).toBe(
      "https://client.example/callback",
    );
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
    expect(redacted.match(/REDACTED/g)).toHaveLength(2);
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
