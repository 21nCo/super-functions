import { describe, expect, it, vi } from "vitest";

import { diagnoseMcpAuthorization } from "../src/index.js";

const discoveryMocks = vi.hoisted(() => ({
  protectedResource: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modelcontextprotocol/sdk/client/auth.js")>();
  discoveryMocks.protectedResource.mockImplementation(
    actual.discoverOAuthProtectedResourceMetadata,
  );
  return {
    ...actual,
    discoverOAuthProtectedResourceMetadata: discoveryMocks.protectedResource,
  };
});

describe("McpFn authorization diagnostics", () => {
  it("discovers protected-resource and authorization metadata without credentials", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      if (url.pathname.includes("oauth-protected-resource")) {
        return Response.json({
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://login.example.com"],
        });
      }
      if (url.pathname.includes("oauth-authorization-server")) {
        return Response.json({
          issuer: "https://login.example.com",
          authorization_endpoint: "https://login.example.com/authorize",
          token_endpoint: "https://login.example.com/token",
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
        });
      }
      return new Response(null, { status: 404 });
    });
    const report = await diagnoseMcpAuthorization("https://mcp.example.com/mcp", {
      fetchImplementation,
    });
    expect(report).toMatchObject({
      ok: true,
      steps: [{ status: "passed" }, { status: "passed" }],
    });
    expect(fetchImplementation).toHaveBeenCalled();
    for (const [, init] of fetchImplementation.mock.calls) {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
    }
  });

  it("fails when the target does not advertise protected-resource metadata", async () => {
    discoveryMocks.protectedResource.mockResolvedValueOnce(undefined);
    const fetchImplementation = vi.fn<typeof fetch>();

    const report = await diagnoseMcpAuthorization("https://mcp.example.com/mcp", {
      fetchImplementation,
    });

    expect(report).toMatchObject({
      ok: false,
      steps: [{
        phase: "resource-discovery",
        status: "failed",
        error: "No OAuth protected-resource metadata was found",
      }],
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
