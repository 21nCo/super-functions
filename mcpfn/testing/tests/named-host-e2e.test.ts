import { afterEach, describe, expect, it } from "vitest";
import { createMcpFnOAuthClientProvider, createOAuthResourceServerHandler } from "@mcpfn/auth";
import { createMcpFnClient, streamableHttpTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import {
  MCPFN_NAMED_OAUTH_HOST_FIXTURES,
  startMockOAuthAuthorizationServer,
  type McpFnStartedMockOAuthServer,
} from "../src/index.js";

describe("named host production OAuth lifecycle", () => {
  const started: McpFnStartedMockOAuthServer[] = [];
  afterEach(async () => {
    await Promise.allSettled(started.splice(0).map((server) => server.close()));
  });

  for (const host of Object.values(MCPFN_NAMED_OAUTH_HOST_FIXTURES)) {
    it(`${host.name} completes code, PKCE, token, MCP, and revocation`, async () => {
      let protectedHandler: ((request: Request) => Promise<Response>) | undefined;
      const clientId = host.id === "claude"
        ? "https://claude.example.com/client.json"
        : "chatgpt-client";
      const fixture = await startMockOAuthAuthorizationServer({
        clientId,
        redirectUris: [...host.redirectUris],
        handle: (request) => {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/mcp" || pathname === "/.well-known/oauth-protected-resource/mcp") {
            return protectedHandler?.(request);
          }
          return undefined;
        },
      });
      started.push(fixture);
      const resource = `${fixture.origin}/mcp`;
      const server = createMcpFnServer({
        info: { name: `${host.id}-oauth-e2e`, version: "1.0.0" },
        registry: new McpFnRegistry().register({
          name: "identity",
          description: "Return the authenticated fixture identity.",
          inputSchema: { type: "object", additionalProperties: false },
          handler: async () => structuredResult({ host: host.id }),
        }),
      });
      const mcpHandler = await server.createWebStandardHandler({ enableJsonResponse: true });
      protectedHandler = createOAuthResourceServerHandler(mcpHandler, {
        resource,
        authorizationServers: [fixture.origin],
        allowInsecureLoopbackAuthorizationServers: true,
        scopesSupported: ["mcp:read"],
        requiredScopes: ["mcp:read"],
        verifier: fixture.oauth,
      });

      let callback: URL | undefined;
      const provider = createMcpFnOAuthClientProvider({
        redirectUrl: host.redirectUris[0],
        clientMetadata: {
          redirect_uris: [...host.redirectUris],
          response_types: [...host.responseTypes],
          grant_types: [...host.grantTypes],
          token_endpoint_auth_method: host.tokenEndpointAuthMethod,
          scope: "mcp:read",
        },
        ...(host.id === "claude" ? { clientMetadataUrl: clientId } : {}),
        openAuthorization: async (url) => {
          const approval = new URL(url);
          approval.searchParams.set("decision", "approve");
          const response = await fetch(approval, { redirect: "manual" });
          expect(response.status).toBe(302);
          callback = new URL(response.headers.get("location")!);
        },
        revoke: async (tokens) => {
          await fetch(fixture.oauth.revocationEndpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: tokens.access_token }),
          });
        },
      });
      if (host.id === "chatgpt") {
        await provider.saveClientInformation({ client_id: clientId });
      }
      const client = createMcpFnClient({
        target: streamableHttpTarget(resource, { authProvider: provider }),
      });
      try {
        await expect(client.connect()).rejects.toMatchObject({
          code: "MCPFN_AUTHORIZATION_REQUIRED",
        });
        expect(callback?.searchParams.get("code")).toBeTruthy();
        expect(callback?.searchParams.get("state")).toBeTruthy();
        await client.completeAuthorization({
          code: callback!.searchParams.get("code")!,
          state: callback!.searchParams.get("state")!,
        });
        await expect(client.tools.call("identity")).resolves.toMatchObject({
          structuredContent: { host: host.id },
        });
        const accessToken = (await provider.tokens())!.access_token;
        await provider.revoke();
        await expect(provider.tokens()).resolves.toBeUndefined();
        await expect(fixture.oauth.verifyAccessToken(accessToken)).rejects.toThrow(
          "Invalid access token",
        );
      } finally {
        await client.close();
        await server.close();
      }
    });
  }
});
