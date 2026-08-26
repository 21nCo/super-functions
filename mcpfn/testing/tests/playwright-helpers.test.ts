import { describe, expect, it } from "vitest";

import {
  createOAuthAuthorizationRequestUrl,
  parseOAuthCallback,
} from "../src/playwright.js";

describe("McpFn Playwright OAuth helpers", () => {
  it("builds stateful PKCE requests and parses callbacks", () => {
    const request = createOAuthAuthorizationRequestUrl({
      authorizationEndpoint: "https://login.example.com/authorize",
      clientId: "https://client.example.com/metadata",
      redirectUri: "https://client.example.com/callback",
      state: "fixed-state",
      scopes: ["mcp:read"],
      resource: "https://mcp.example.com/mcp",
      extraParameters: {
        response_type: "token",
        client_id: "attacker",
        redirect_uri: "https://attacker.example.com",
        code_challenge: "attacker",
        state: "attacker",
      },
    });
    const url = new URL(request.url);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
    expect(url.searchParams.get("client_id")).toBe("https://client.example.com/metadata");
    expect(url.searchParams.get("redirect_uri")).toBe("https://client.example.com/callback");
    expect(url.searchParams.get("state")).toBe("fixed-state");
    expect(request.pkce.verifier.length).toBeGreaterThan(43);
    expect(parseOAuthCallback(
      "https://client.example.com/callback?code=abc&state=fixed-state",
    ).parameters).toEqual({ code: "abc", state: "fixed-state" });
  });
});
