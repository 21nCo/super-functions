import { describe, expect, it } from "vitest";

import { createOAuthResourceServerHandler, protectedResourceMetadataUrl } from "@mcpfn/auth";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import {
  apiKeyCredential,
  assertAuthRegressionSuite,
  assertAuthorizationCodeClientMetadata,
  assertBearerResourceChallenge,
  bearerCredential,
  createOAuthClientMetadataVariants,
  MCPFN_NAMED_OAUTH_HOST_FIXTURES,
  type McpFnAuthCredential,
} from "../src/auth.js";

describe("McpFn authentication regression suite", () => {
  it("covers OAuth rejection, scope, expiry, audience, revocation, and trusted success", async () => {
    const now = 2_000_000;
    const resource = "https://mcp.example.com/mcp";
    const records = new Map<string, AuthInfo & { revoked?: boolean }>();
    let sequence = 0;
    const verifier = {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        const record = records.get(token);
        if (!record || record.revoked) throw new Error("invalid token");
        return record;
      },
    };
    const handler = createOAuthResourceServerHandler(
      async (_request, options) => Response.json({ clientId: options?.authInfo?.clientId }),
      {
        resource,
        authorizationServers: ["https://login.example.com"],
        requiredScopes: ["mcp:read"],
        verifier,
        clock: () => now,
      },
    );
    const results = await assertAuthRegressionSuite({
      kind: "oauth",
      resource,
      wrongResource: "https://other.example.com/mcp",
      requiredScopes: ["mcp:read"],
      protectedResourceMetadataUrl: protectedResourceMetadataUrl(resource).toString(),
      provider: {
        capabilities: {
          expiration: true,
          resourceBinding: true,
          revocation: true,
          scopes: true,
        },
        async issue(input) {
          const token = `token-${++sequence}`;
          records.set(token, {
            token,
            clientId: "skillplane-test-client",
            scopes: input.scopes ?? [],
            expiresAt: Math.floor(now / 1_000) + (input.expiresInSeconds ?? 300),
            ...(input.resource ? { resource: new URL(input.resource) } : {}),
          });
          return bearerCredential(token);
        },
        async revoke(credential) {
          const token = new Headers(credential.headers)
            .get("authorization")?.replace(/^Bearer\s+/i, "");
          const record = token ? records.get(token) : undefined;
          if (record) record.revoked = true;
        },
      },
      target: {
        request: (headers) => handler(new Request(resource, {
          method: "POST",
          headers,
          body: "{}",
        })),
      },
      async verifyAuthenticatedResponse(response) {
        await expect(response.json()).resolves.toEqual({
          clientId: "skillplane-test-client",
        });
      },
    });

    expect(results).toHaveLength(8);
    expect(results.every((result) => result.status === "passed")).toBe(true);
  });

  it("covers custom-header API keys without imposing OAuth challenge semantics", async () => {
    const active = new Set<string>();
    let sequence = 0;
    const provider = {
      capabilities: { revocation: true },
      async issue(): Promise<McpFnAuthCredential> {
        const key = `spk_test_${++sequence}`;
        active.add(key);
        return apiKeyCredential(key, { headerName: "x-api-key", scheme: "" });
      },
      async revoke(credential: McpFnAuthCredential): Promise<void> {
        const key = new Headers(credential.headers).get("x-api-key");
        if (key) active.delete(key);
      },
    };
    const results = await assertAuthRegressionSuite({
      kind: "api-key",
      provider,
      invalidCredentialHeaders: { "x-api-key": "not-a-real-key" },
      target: {
        async request(headers) {
          const key = headers.get("x-api-key");
          return new Response(null, { status: key && active.has(key) ? 204 : 401 });
        },
      },
    });
    expect(results.map((result) => result.name)).toEqual([
      "missing-credential",
      "invalid-credential",
      "valid-credential",
      "revoked-credential",
    ]);
  });

  it("accepts authorization-code clients that advertise unrelated extension grants", () => {
    const variants = createOAuthClientMetadataVariants("https://client.example.com");
    for (const metadata of Object.values(variants)) {
      expect(() => assertAuthorizationCodeClientMetadata(metadata, metadata.client_id))
        .not.toThrow();
    }
    expect(variants.jwtBearerExtension.grant_types).toContain(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(variants.deviceCodeExtension.grant_types).toContain(
      "urn:ietf:params:oauth:grant-type:device_code",
    );
  });

  it("publishes named ChatGPT and Claude host-shaped fixtures", () => {
    expect(MCPFN_NAMED_OAUTH_HOST_FIXTURES.chatgpt.redirectUris[0]).toContain("chatgpt.com");
    expect(MCPFN_NAMED_OAUTH_HOST_FIXTURES.claude.grantTypes).toContain(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(MCPFN_NAMED_OAUTH_HOST_FIXTURES.claude.grantTypes).toContain("authorization_code");
  });

  it("selects Bearer from multiple challenges and rejects malformed metadata URLs", () => {
    const response = new Response(null, {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="legacy", Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
      },
    });
    expect(assertBearerResourceChallenge(response).parameters.resource_metadata)
      .toBe("https://mcp.example.com/.well-known/oauth-protected-resource");
    expect(() => assertBearerResourceChallenge(new Response(null, {
      status: 401,
      headers: { "www-authenticate": 'Bearer resource_metadata="not-a-url"' },
    }))).toThrow(/invalid resource_metadata URL/);
  });
});
