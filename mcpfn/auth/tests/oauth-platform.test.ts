import { describe, expect, it, vi } from "vitest";

import {
  MemoryMcpFnOAuthSessionStore,
  createAuthProviderMcpHandler,
  createMcpAuthorizationCompatibilityHandler,
  createMcpFnOAuthClientProvider,
  matchMcpRedirectUri,
  normalizeMcpClientRegistration,
} from "../src/index.js";

describe("McpFn OAuth client compatibility", () => {
  it("rejects registration/request drift before opening the browser", async () => {
    const openAuthorization = vi.fn();
    const diagnostics: unknown[] = [];
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/oauth/callback",
      clientMetadata: {
        redirect_uris: ["https://registered.example.com/oauth/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      },
      openAuthorization,
      diagnostics: (event) => { diagnostics.push(event); },
    });
    await provider.saveClientInformation({ client_id: "chatgpt-client" });
    const authorizationUrl = new URL("https://login.example.com/authorize");
    authorizationUrl.searchParams.set("client_id", "chatgpt-client");
    authorizationUrl.searchParams.set("redirect_uri", String(provider.redirectUrl));

    await expect(provider.redirectToAuthorization(authorizationUrl)).rejects.toMatchObject({
      code: "MCPFN_REDIRECT_MISMATCH",
    });
    expect(openAuthorization).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnostics)).not.toContain("code_verifier");
  });

  it("accepts an explicitly variable RFC 8252 loopback port but not a fixed-port drift", () => {
    expect(matchMcpRedirectUri(
      "http://127.0.0.1:43123/callback",
      ["http://127.0.0.1/callback"],
    ).kind).toBe("loopback-dynamic-port");
    expect(() => matchMcpRedirectUri(
      "http://127.0.0.1:43123/callback",
      ["http://127.0.0.1:43124/callback"],
    )).toThrow(/not registered/);
    expect(() => matchMcpRedirectUri(
      "com.example.app:/callback",
      ["com.example.app:/callback"],
    )).toThrow(/not registered/);
    expect(matchMcpRedirectUri(
      "com.example.app:/callback",
      ["com.example.app:/callback"],
      { allowPrivateUseSchemes: true },
    ).kind).toBe("exact");
  });

  it("stores no credentials persistently unless an encrypted store is supplied", async () => {
    const store = new MemoryMcpFnOAuthSessionStore();
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: {
        redirect_uris: ["https://app.example.com/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code"],
      },
      store,
      openAuthorization: () => undefined,
    });
    await provider.saveTokens({ access_token: "secret", token_type: "Bearer" });
    await expect(provider.tokens()).resolves.toMatchObject({ access_token: "secret" });
    expect(store.security).toBe("memory");
  });

  it("correlates callback state and classifies later token saves as refreshes", async () => {
    const diagnostics: Array<{ phase: string }> = [];
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: {
        redirect_uris: ["https://app.example.com/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
      },
      openAuthorization: () => undefined,
      diagnostics: (event) => { diagnostics.push(event); },
    });
    const state = await provider.state();
    await expect(provider.validateAuthorizationState("wrong")).rejects.toThrow(/state/);
    await provider.validateAuthorizationState(state);
    await provider.saveTokens({ access_token: "one", refresh_token: "refresh", token_type: "Bearer" });
    await provider.saveTokens({ access_token: "two", refresh_token: "refresh-2", token_type: "Bearer" });
    expect(diagnostics.map((event) => event.phase)).toContain("token-refresh");
  });

  it("isolates OAuth diagnostic observer failures", async () => {
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: {
        redirect_uris: ["https://app.example.com/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code"],
      },
      openAuthorization: () => undefined,
      diagnostics: async () => {
        throw new Error("observer failed");
      },
    });

    await expect(provider.saveClientInformation({ client_id: "client-1" })).resolves.toBeUndefined();
    await expect(provider.saveTokens({ access_token: "opaque", token_type: "Bearer" }))
      .resolves.toBeUndefined();
  });
});

describe("McpFn hosted authorization compatibility", () => {
  const issuer = "https://login.example.com";
  const resource = "https://mcp.example.com/mcp";
  const chatgpt = normalizeMcpClientRegistration({
    clientId: "chatgpt-client",
    source: "pre-registered",
    metadata: {
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    },
  });
  const claude = normalizeMcpClientRegistration({
    clientId: "https://claude.example.com/client.json",
    source: "client-metadata-document",
    metadata: {
      redirect_uris: ["https://claude.example.com/callback"],
      response_types: ["code"],
      grant_types: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      ],
      token_endpoint_auth_method: "none",
    },
  });

  function handler() {
    const clients = new Map([[chatgpt.clientId, chatgpt], [claude.clientId, claude]]);
    return createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async (clientId) => clients.get(clientId) ?? null },
      supportedScopes: ["mcp:read"],
      allowedResources: [resource],
      authorize: async (input) => Response.json({
        ok: true,
        clientId: input.client.clientId,
        redirectMatch: input.redirectMatch,
      }),
      token: async () => Response.json({ access_token: "opaque", token_type: "Bearer" }),
    });
  }

  function authorizationUrl(clientId: string, redirectUri: string): URL {
    const url = new URL("/authorize", issuer);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", "challenge");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", resource);
    url.searchParams.set("scope", "mcp:read");
    return url;
  }

  it("accepts ChatGPT-shaped exact callbacks", async () => {
    const response = await handler()(new Request(authorizationUrl(
      chatgpt.clientId,
      chatgpt.redirectUris[0],
    )));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      clientId: "chatgpt-client",
      redirectMatch: "exact",
    });
  });

  it("accepts Claude-shaped extensible grants for the compatible code flow", async () => {
    const response = await handler()(new Request(authorizationUrl(
      claude.clientId,
      claude.redirectUris[0],
    )));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      clientId: claude.clientId,
    });
  });

  it("classifies an unregistered callback at the authorization-request phase", async () => {
    const response = await handler()(new Request(authorizationUrl(
      chatgpt.clientId,
      "https://chatgpt.com/wrong-callback",
    )));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: expect.stringContaining("not registered"),
    });
  });

  it("re-authorizes every Client ID Metadata Document redirect before fetching it", async () => {
    const clientId = "https://clients.example.com/client.json";
    const redirected = "https://blocked.example.com/client.json";
    const allow = vi.fn(async (url: URL) => url.hostname === "clients.example.com");
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, {
      status: 302,
      headers: { location: redirected },
    }));
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null },
      authorize: async () => Response.json({ ok: true }),
      token: async () => Response.json({ access_token: "opaque", token_type: "Bearer" }),
      clientMetadataDocuments: { enabled: true, allow, fetch },
    });

    const response = await compatibility(new Request(authorizationUrl(
      clientId,
      "https://client.example.com/callback",
    )));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_client" });
    expect(allow.mock.calls.map(([url]) => url.toString())).toEqual([clientId, redirected]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("enforces a streaming byte cap for metadata without content-length", async () => {
    const clientId = "https://clients.example.com/client.json";
    const fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(64)));
        controller.close();
      },
    }), { status: 200 }));
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null },
      authorize: async () => Response.json({ ok: true }),
      token: async () => Response.json({ access_token: "opaque", token_type: "Bearer" }),
      clientMetadataDocuments: {
        enabled: true,
        allow: async () => true,
        fetch,
        maxBytes: 16,
      },
    });

    const response = await compatibility(new Request(authorizationUrl(
      clientId,
      "https://client.example.com/callback",
    )));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("aborts metadata requests at the configured deadline", async () => {
    const clientId = "https://clients.example.com/client.json";
    const fetch = vi.fn(() => new Promise<Response>(() => undefined));
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null },
      authorize: async () => Response.json({ ok: true }),
      token: async () => Response.json({ access_token: "opaque", token_type: "Bearer" }),
      clientMetadataDocuments: {
        enabled: true,
        allow: async () => true,
        fetch,
        timeoutMs: 5,
      },
    });

    const response = await compatibility(new Request(authorizationUrl(
      clientId,
      "https://client.example.com/callback",
    )));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client",
      error_description: expect.stringContaining("timed out"),
    });
  });

  it("isolates hosted authorization diagnostic observer failures", async () => {
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async (clientId) => clientId === chatgpt.clientId ? chatgpt : null },
      authorize: async () => Response.json({ ok: true }),
      token: async () => Response.json({ access_token: "opaque", token_type: "Bearer" }),
      diagnostics: async () => {
        throw new Error("observer failed");
      },
    });

    const response = await compatibility(new Request(authorizationUrl(
      chatgpt.clientId,
      chatgpt.redirectUris[0],
    )));

    expect(response.status).toBe(200);
  });
});

describe("generic auth provider composition", () => {
  it("maps trusted sessions into official MCP AuthInfo without tool arguments", async () => {
    const downstream = vi.fn(async (_request: Request, options?: { authInfo?: unknown }) =>
      Response.json(options?.authInfo));
    const handler = createAuthProviderMcpHandler(downstream, {
      resource: "https://mcp.example.com/mcp",
      provider: {
        authenticate: async () => ({
          id: "client-1",
          type: "oauth",
          subject: {
            actorId: "user-1",
            actorType: "user",
            tenantId: "workspace-1",
          },
          scopes: ["mcp:read"],
        }),
      },
    });
    const response = await handler(new Request("https://mcp.example.com/mcp", {
      headers: { authorization: "Bearer opaque-token" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      clientId: "client-1",
      scopes: ["mcp:read"],
      extra: { subject: "user-1", tenantId: "workspace-1" },
    });
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("preserves provider resource authorization and fails closed on denial", async () => {
    const session = {
      id: "client-1",
      type: "oauth",
      subject: { actorId: "user-1", actorType: "user" as const },
    };
    const authorize = vi.fn(async () => false);
    const downstream = vi.fn(async () => Response.json({ ok: true }));
    const handler = createAuthProviderMcpHandler(downstream, {
      resource: "https://mcp.example.com/mcp",
      provider: {
        authenticate: async () => session,
        authorize,
      },
    });

    const response = await handler(new Request("https://mcp.example.com/mcp", {
      headers: { authorization: "Bearer opaque-token" },
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
    expect(authorize).toHaveBeenCalledWith(session, "https://mcp.example.com/mcp");
    expect(downstream).not.toHaveBeenCalled();
  });

  it("rejects missing bearer credentials before invoking the provider", async () => {
    const authenticate = vi.fn();
    const handler = createAuthProviderMcpHandler(
      async () => Response.json({ ok: true }),
      {
        resource: "https://mcp.example.com/mcp",
        provider: { authenticate },
      },
    );

    const response = await handler(new Request("https://mcp.example.com/mcp"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("does not let mapped extras replace trusted principal fields", async () => {
    const downstream = vi.fn(async (_request: Request, options?: { authInfo?: unknown }) =>
      Response.json(options?.authInfo));
    const handler = createAuthProviderMcpHandler(downstream, {
      resource: "https://mcp.example.com/mcp",
      provider: {
        authenticate: async () => ({
          id: "client-1",
          type: "oauth",
          subject: { actorId: "user-1", actorType: "user" },
        }),
      },
      map: async () => ({
        subject: "trusted-user",
        clientId: "trusted-client",
        scopes: ["mcp:read"],
        resourceIds: ["trusted-resource"],
        tenantId: "trusted-tenant",
        extra: {
          subject: "attacker",
          resourceIds: ["attacker-resource"],
          tenantId: "attacker-tenant",
          visible: "retained",
        },
      }),
    });

    const response = await handler(new Request("https://mcp.example.com/mcp", {
      headers: { authorization: "Bearer opaque-token" },
    }));

    await expect(response.json()).resolves.toMatchObject({
      extra: {
        subject: "trusted-user",
        resourceIds: ["trusted-resource"],
        tenantId: "trusted-tenant",
        visible: "retained",
      },
    });
  });
});
