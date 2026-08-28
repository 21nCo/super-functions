import { describe, expect, it, vi } from "vitest";

import {
  MCP_ENTERPRISE_MANAGED_AUTHORIZATION_EXTENSION_ID,
  MCP_ID_JAG_GRANT_PROFILE,
  createOAuthResourceServerHandler,
  enterpriseManagedAuthorizationClientMetadata,
  protectedResourceMetadataUrl,
  withEnterpriseManagedAuthorization,
} from "../src/index.js";

describe("McpFn OAuth resource server", () => {
  const resource = "https://mcp.example.com/api/mcp";

  it("serves RFC 9728 metadata at the resource-specific well-known URL", async () => {
    const handler = createOAuthResourceServerHandler(
      async () => new Response("mcp"),
      {
        resource,
        authorizationServers: ["https://login.example.com"],
        scopesSupported: ["write", "read", "read"],
        resourceName: "Example MCP",
        verifier: { verifyAccessToken: async () => { throw new Error("unused"); } },
      },
    );
    expect(protectedResourceMetadataUrl(resource).toString()).toBe(
      "https://mcp.example.com/.well-known/oauth-protected-resource/api/mcp",
    );
    const response = await handler(new Request(
      "https://mcp.example.com/.well-known/oauth-protected-resource/api/mcp",
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://mcp.example.com/api/mcp",
      authorization_servers: ["https://login.example.com"],
      scopes_supported: ["read", "write"],
      bearer_methods_supported: ["header"],
    });
  });

  it("challenges missing tokens and enforces scopes, expiry, and resource audience", async () => {
    const verifier = vi.fn(async (token: string) => ({
      token,
      clientId: "client-1",
      scopes: token === "scoped" ? ["mcp:read"] : [],
      expiresAt: token === "expired" ? 10 : 2_000,
      ...(token === "missing-resource"
        ? {}
        : {
            resource: token === "wrong-resource"
              ? new URL("https://other.example.com/mcp")
              : new URL(resource),
          }),
    }));
    const downstream = vi.fn(async (_request: Request, options?: { authInfo?: unknown }) =>
      Response.json(options?.authInfo));
    const handler = createOAuthResourceServerHandler(downstream, {
      resource,
      authorizationServers: ["https://login.example.com"],
      requiredScopes: ["mcp:read"],
      verifier: { verifyAccessToken: verifier },
      clock: () => 1_000_000,
    });
    const request = (token?: string) => new Request(resource, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: "{}",
    });

    const missing = await handler(request());
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect((await handler(request("unscoped"))).status).toBe(403);
    expect((await handler(request("expired"))).status).toBe(401);
    expect((await handler(request("missing-resource"))).status).toBe(401);
    expect((await handler(request("wrong-resource"))).status).toBe(401);

    const accepted = await handler(request("scoped"));
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      token: "scoped",
      clientId: "client-1",
      scopes: ["mcp:read"],
    });
    expect(downstream).toHaveBeenCalledTimes(1);
    expect((await handler(new Request(resource, {
      method: "POST",
      headers: { authorization: "Bearer   scoped" },
      body: "{}",
    }))).status).toBe(200);
  });

  it("preserves the request body when dynamic scopes inspect it", async () => {
    const downstream = vi.fn(async (request: Request) => Response.json(await request.json()));
    const handler = createOAuthResourceServerHandler(downstream, {
      resource,
      authorizationServers: ["https://login.example.com"],
      requiredScopes: async (request) => {
        const body = await request.json() as { method?: string };
        return body.method === "tools/call" ? ["mcp:write"] : ["mcp:read"];
      },
      verifier: {
        verifyAccessToken: async () => ({
          token: "scoped",
          clientId: "client-1",
          scopes: ["mcp:write"],
          resource: new URL(resource),
        }),
      },
    });
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call" };
    const response = await handler(new Request(resource, {
      method: "POST",
      headers: {
        authorization: "Bearer scoped",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(body);
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("cancels an unread dynamic-scope clone before forwarding a streaming body", async () => {
    let cancel: ReturnType<typeof vi.spyOn> | undefined;
    const downstream = vi.fn(async (request: Request) => new Response(await request.text()));
    const handler = createOAuthResourceServerHandler(downstream, {
      resource,
      authorizationServers: ["https://login.example.com"],
      requiredScopes: async (request) => {
        cancel = vi.spyOn(request.body!, "cancel");
        return [];
      },
      verifier: {
        verifyAccessToken: async () => ({
          token: "scoped",
          clientId: "client-1",
          scopes: [],
          resource: new URL(resource),
        }),
      },
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("bounded"));
        controller.close();
      },
    });
    const response = await handler(new Request(resource, {
      method: "POST",
      headers: { authorization: "Bearer scoped" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));

    await expect(response.text()).resolves.toBe("bounded");
    expect(cancel).toHaveBeenCalledOnce();
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("adds stable enterprise-managed authorization discovery and client metadata", () => {
    expect(withEnterpriseManagedAuthorization({ issuer: "https://login.example.com" }))
      .toMatchObject({
        issuer: "https://login.example.com",
        authorization_grant_profiles_supported: [MCP_ID_JAG_GRANT_PROFILE],
      });
    expect(enterpriseManagedAuthorizationClientMetadata()).toMatchObject({
      "io.modelcontextprotocol/clientCapabilities": {
        extensions: {
          [MCP_ENTERPRISE_MANAGED_AUTHORIZATION_EXTENSION_ID]: {},
        },
      },
    });
  });
});
