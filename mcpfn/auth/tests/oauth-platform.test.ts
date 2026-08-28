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
    await expect(provider.validateAuthorizationState(state)).rejects.toThrow(/state/);
    await provider.saveTokens({ access_token: "one", refresh_token: "refresh", token_type: "Bearer" });
    await provider.saveTokens({ access_token: "two", refresh_token: "refresh-2", token_type: "Bearer" });
    expect(diagnostics.map((event) => event.phase)).toContain("token-refresh");
  });

  it("covers IPv4, IPv6, localhost, native, query, and multiple-redirect policy", () => {
    expect(matchMcpRedirectUri(
      "http://[::1]:43123/callback",
      ["http://[::1]/callback"],
    ).kind).toBe("loopback-dynamic-port");
    expect(matchMcpRedirectUri(
      "http://localhost:43123/callback",
      ["http://localhost/callback"],
      { allowLocalhostLoopback: true },
    ).kind).toBe("loopback-dynamic-port");
    expect(matchMcpRedirectUri(
      "com.example.app:/oauth/callback",
      ["https://app.example.com/callback", "com.example.app:/oauth/callback"],
      { allowPrivateUseSchemes: true },
    ).kind).toBe("exact");
    expect(() => matchMcpRedirectUri(
      "http://127.0.0.1:43123/callback?environment=prod",
      ["http://127.0.0.1/callback?environment=dev"],
    )).toThrow(/not registered/);
    expect(() => matchMcpRedirectUri(
      "http://localhost:43123/callback",
      ["http://localhost/callback"],
    )).toThrow(/not registered/);
    try {
      matchMcpRedirectUri(
        "https://user:password@client.example.com/wrong?code=secret",
        ["https://client.example.com/callback"],
      );
    } catch (error) {
      expect(error).toMatchObject({
        requested: "https://client.example.com/wrong?redacted",
      });
    }
    expect(() => matchMcpRedirectUri(
      "not a URI",
      ["https://client.example.com/callback"],
    )).toThrow(/not registered/);
    try {
      matchMcpRedirectUri("not a URI", ["https://client.example.com/callback"]);
    } catch (error) {
      expect(error).toMatchObject({ requested: "[invalid redirect URI]" });
    }
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

  it("cleans pending callback material after exchange and diagnoses opener/revocation failures", async () => {
    const diagnostics: Array<{ phase: string; outcome: string; code?: string }> = [];
    const store = new MemoryMcpFnOAuthSessionStore();
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: {
        redirect_uris: ["https://app.example.com/callback"],
        response_types: ["code"],
        grant_types: ["authorization_code"],
      },
      store,
      openAuthorization: async () => { throw new Error("browser unavailable"); },
      diagnostics: (event) => { diagnostics.push(event); },
    });
    await provider.saveClientInformation({ client_id: "client-1" });
    await provider.saveCodeVerifier("verifier");
    await provider.state();
    await provider.saveTokens({ access_token: "access", token_type: "Bearer" });
    await expect(provider.codeVerifier()).rejects.toThrow(/No PKCE verifier/);
    await expect(provider.validateAuthorizationState("stale")).rejects.toThrow(/state/);

    const authorizationUrl = new URL("https://login.example.com/authorize");
    authorizationUrl.searchParams.set("client_id", "client-1");
    authorizationUrl.searchParams.set("redirect_uri", "https://app.example.com/callback");
    await expect(provider.redirectToAuthorization(authorizationUrl)).rejects.toThrow(
      "browser unavailable",
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({
      phase: "authorization-request",
      outcome: "failed",
    }));
    await expect(provider.revoke()).rejects.toMatchObject({
      code: "MCPFN_REVOCATION_UNAVAILABLE",
    });
    await expect(provider.tokens()).resolves.toMatchObject({ access_token: "access" });
    expect(diagnostics).toContainEqual(expect.objectContaining({
      phase: "token-revocation",
      outcome: "failed",
      code: "MCPFN_REVOCATION_UNAVAILABLE",
    }));
  });

  it("classifies a verifier-bound save as exchange and reports storage failures", async () => {
    const diagnostics: Array<{ phase: string; outcome: string; code?: string }> = [];
    const store = new MemoryMcpFnOAuthSessionStore();
    const provider = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: { redirect_uris: ["https://app.example.com/callback"] },
      store,
      openAuthorization: () => undefined,
      diagnostics: (event) => { diagnostics.push(event); },
    });
    await provider.saveTokens({ access_token: "old", token_type: "Bearer" });
    await provider.saveCodeVerifier("v".repeat(43));
    await provider.saveTokens({ access_token: "new", token_type: "Bearer" });
    expect(diagnostics.at(-1)).toMatchObject({
      phase: "token-exchange",
      outcome: "succeeded",
    });

    class FailingStore extends MemoryMcpFnOAuthSessionStore {
      override async setTokens(): Promise<void> {
        throw Object.assign(new Error("storage unavailable"), { code: "E_STORAGE" });
      }
    }
    const failedDiagnostics: typeof diagnostics = [];
    const failing = createMcpFnOAuthClientProvider({
      redirectUrl: "https://app.example.com/callback",
      clientMetadata: { redirect_uris: ["https://app.example.com/callback"] },
      store: new FailingStore(),
      openAuthorization: () => undefined,
      diagnostics: (event) => { failedDiagnostics.push(event); },
    });
    await expect(failing.saveTokens({ access_token: "new", token_type: "Bearer" }))
      .rejects.toThrow("storage unavailable");
    expect(failedDiagnostics.at(-1)).toMatchObject({
      phase: "token-exchange",
      outcome: "failed",
      code: "E_STORAGE",
    });
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
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({
          access_token: "opaque",
          token_type: "Bearer",
        }),
      },
    });
  }

  function authorizationUrl(clientId: string, redirectUri: string): URL {
    const url = new URL("/authorize", issuer);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", "c".repeat(43));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", "state-1");
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

  it("rejects duplicated authorization parameters before handing off consent", async () => {
    for (const name of [
      "response_type",
      "client_id",
      "redirect_uri",
      "code_challenge",
      "code_challenge_method",
      "state",
      "resource",
      "scope",
    ]) {
      const url = authorizationUrl(chatgpt.clientId, chatgpt.redirectUris[0]);
      url.searchParams.append(name, url.searchParams.get(name)!);
      const response = await handler()(new Request(url));
      if (["client_id", "redirect_uri"].includes(name)) {
        expect(response.status, name).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: "invalid_request",
        });
      } else {
        expect(response.status, name).toBe(302);
        expect(
          new URL(response.headers.get("location")!).searchParams.get("error"),
        ).toBe("invalid_request");
      }
    }
  });

  it("redirects validation errors only after matching a registered callback", async () => {
    const trusted = authorizationUrl(chatgpt.clientId, chatgpt.redirectUris[0]);
    trusted.searchParams.set("code_challenge_method", "plain");
    const trustedResponse = await handler()(new Request(trusted));
    expect(trustedResponse.status).toBe(302);
    const location = new URL(trustedResponse.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(chatgpt.redirectUris[0]);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("state")).toBe("state-1");

    const untrusted = authorizationUrl(
      chatgpt.clientId,
      "https://attacker.example.com/callback",
    );
    untrusted.searchParams.set("code_challenge_method", "plain");
    const untrustedResponse = await handler()(new Request(untrusted));
    expect(untrustedResponse.status).toBe(400);
    expect(untrustedResponse.headers.get("location")).toBeNull();
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

  it("returns invalid_target for a malformed authorization resource", async () => {
    const url = authorizationUrl(chatgpt.clientId, chatgpt.redirectUris[0]);
    url.searchParams.set("resource", "not-an-absolute-url");
    const response = await handler()(new Request(url));
    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error"),
    ).toBe("invalid_target");
  });

  it("preserves issuer path prefixes in discovery and hosted routes", async () => {
    const prefixedIssuer = "https://login.example.com/tenant-a";
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer: prefixedIssuer,
      clients: {
        resolve: async (clientId) => clientId === chatgpt.clientId ? chatgpt : null,
      },
      authorize: async () => Response.json({ ok: true }),
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({ access_token: "opaque", token_type: "Bearer" }),
      },
    });
    const discovery = await compatibility(new Request(
      "https://login.example.com/.well-known/oauth-authorization-server/tenant-a",
    ));
    await expect(discovery.json()).resolves.toMatchObject({
      issuer: prefixedIssuer,
      authorization_endpoint: `${prefixedIssuer}/authorize`,
      token_endpoint: `${prefixedIssuer}/token`,
    });
    const url = authorizationUrl(chatgpt.clientId, chatgpt.redirectUris[0]);
    url.pathname = "/tenant-a/authorize";
    url.searchParams.delete("resource");
    expect((await compatibility(new Request(url))).status).toBe(200);
    url.pathname = "/authorize";
    expect((await compatibility(new Request(url))).status).toBe(404);
  });

  it("supports hosted endpoints beneath a prefix without changing the issuer", async () => {
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      endpointPrefix: "/auth/oauth",
      clients: {
        resolve: async (clientId) =>
          clientId === chatgpt.clientId ? chatgpt : null,
      },
      authorize: async () => Response.json({ ok: true }),
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({
          access_token: "opaque",
          token_type: "Bearer",
        }),
      },
    });
    const discovery = await compatibility(
      new Request(
        "https://login.example.com/.well-known/oauth-authorization-server",
      ),
    );
    await expect(discovery.json()).resolves.toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/auth/oauth/authorize`,
      token_endpoint: `${issuer}/auth/oauth/token`,
    });
    const url = authorizationUrl(chatgpt.clientId, chatgpt.redirectUris[0]);
    url.pathname = "/auth/oauth/authorize";
    url.searchParams.delete("resource");
    expect((await compatibility(new Request(url))).status).toBe(200);
    url.pathname = "/authorize";
    expect((await compatibility(new Request(url))).status).toBe(404);
  });

  it("rejects unsafe redirects before persisting a dynamic registration", async () => {
    const register = vi.fn();
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null, register },
      authorize: async () => Response.json({ ok: true }),
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({
          access_token: "opaque",
          token_type: "Bearer",
        }),
      },
    });
    const response = await compatibility(
      new Request(`${issuer}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://public.example.com/callback"],
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects incompatible dynamic-registration auth, response, grant, and scope metadata", async () => {
    const register = vi.fn();
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null, register },
      authorize: async () => Response.json({ ok: true }),
      supportedScopes: ["mcp:read"],
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({
          access_token: "opaque",
          token_type: "Bearer",
        }),
      },
    });
    for (const metadata of [
      {
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "client_secret_basic",
      },
      {
        redirect_uris: ["https://client.example/callback"],
        response_types: ["token"],
      },
      {
        redirect_uris: ["https://client.example/callback"],
        grant_types: ["password"],
      },
      {
        redirect_uris: ["https://client.example/callback"],
        scope: "mcp:read admin:all",
      },
    ]) {
      const response = await compatibility(
        new Request(`${issuer}/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(metadata),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(register).not.toHaveBeenCalled();
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
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({ access_token: "opaque", token_type: "Bearer" }),
      },
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
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async () => null },
      authorize: async () => Response.json({ ok: true }),
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({ access_token: "opaque", token_type: "Bearer" }),
      },
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
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({ access_token: "opaque", token_type: "Bearer" }),
      },
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

  it("derives hosted metadata and owns code, auth-method, refresh, and revocation policy", async () => {
    let activeRefreshes = 0;
    let maximumRefreshes = 0;
    let refreshCalls = 0;
    let releaseFirst!: () => void;
    const firstRefresh = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const exchangeAuthorizationCode = vi.fn(async () => ({
      access_token: "access-1",
      token_type: "Bearer",
      refresh_token: "refresh-1",
    }));
    const refreshToken = vi.fn(async () => {
      refreshCalls += 1;
      activeRefreshes += 1;
      maximumRefreshes = Math.max(maximumRefreshes, activeRefreshes);
      if (refreshCalls === 1) await firstRefresh;
      activeRefreshes -= 1;
      return {
        access_token: `access-${refreshCalls + 1}`,
        token_type: "Bearer",
        refresh_token: `refresh-${refreshCalls + 1}`,
      };
    });
    const revokeToken = vi.fn(async () => undefined);
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async (clientId) => clientId === chatgpt.clientId ? chatgpt : null },
      authorize: async () => Response.json({ ok: true }),
      allowedResources: [resource],
      supportedScopes: ["mcp:read"],
      tokenAuthority: { exchangeAuthorizationCode, refreshToken, revokeToken },
    });
    const post = (path: string, body: Record<string, string>) => compatibility(new Request(
      new URL(path, issuer),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      },
    ));

    const discovery = await compatibility(new Request(
      new URL("/.well-known/oauth-authorization-server", issuer),
    )).then((response) => response.json());
    expect(discovery).toMatchObject({
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint: `${issuer}/revoke`,
    });
    const exchange = await post("/token", {
      grant_type: "authorization_code",
      client_id: chatgpt.clientId,
      code: "code-1",
      redirect_uri: chatgpt.redirectUris[0],
      code_verifier: "v".repeat(43),
      resource,
    });
    expect(exchange.status).toBe(200);
    expect(exchangeAuthorizationCode).toHaveBeenCalledWith(expect.objectContaining({
      method: "none",
      code: "code-1",
      codeVerifier: "v".repeat(43),
      resource,
    }), expect.any(Request));

    const refreshBody = {
      grant_type: "refresh_token",
      client_id: chatgpt.clientId,
      refresh_token: "refresh-1",
    };
    const refreshOne = post("/token", refreshBody);
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalledTimes(1));
    const refreshTwo = post("/token", refreshBody);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(refreshToken).toHaveBeenCalledTimes(1);
    releaseFirst();
    expect((await refreshOne).status).toBe(200);
    expect((await refreshTwo).status).toBe(200);
    expect(maximumRefreshes).toBe(1);

    expect((await post("/token", {
      grant_type: "password",
      client_id: chatgpt.clientId,
    })).status).toBe(400);
    expect((await post("/revoke", {
      client_id: chatgpt.clientId,
      token: "access-1",
      token_type_hint: "access_token",
    })).status).toBe(200);
    expect(revokeToken).toHaveBeenCalledWith(expect.objectContaining({
      token: "access-1",
      tokenTypeHint: "access_token",
    }), expect.any(Request));
  });

  it("negotiates secret client authentication and rejects method drift", async () => {
    const secretClient = normalizeMcpClientRegistration({
      clientId: "secret-client",
      source: "pre-registered",
      metadata: {
        redirect_uris: ["https://client.example.com/callback"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "client_secret_basic",
      },
    });
    const authenticateClient = vi.fn(async (input: { clientSecret: string }) =>
      input.clientSecret === "correct");
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async (clientId) => clientId === secretClient.clientId ? secretClient : null },
      authorize: async () => Response.json({ ok: true }),
      capabilities: { tokenEndpointAuthMethods: ["client_secret_basic"] },
      tokenAuthority: {
        authenticateClient,
        exchangeAuthorizationCode: async () => ({ access_token: "access", token_type: "Bearer" }),
      },
    });
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "code",
      redirect_uri: secretClient.redirectUris[0],
      code_verifier: "v".repeat(43),
    });
    const accepted = await compatibility(new Request(`${issuer}/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${btoa("secret-client:correct")}`,
      },
      body,
    }));
    expect(accepted.status).toBe(200);
    expect(authenticateClient).toHaveBeenCalledOnce();
    const drift = await compatibility(new Request(`${issuer}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...Object.fromEntries(body), client_id: "secret-client" }),
    }));
    expect(drift.status).toBe(401);
    await expect(drift.json()).resolves.toMatchObject({ error: "invalid_client" });
  });

  it("isolates hosted authorization diagnostic observer failures", async () => {
    const compatibility = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: { resolve: async (clientId) => clientId === chatgpt.clientId ? chatgpt : null },
      authorize: async () => Response.json({ ok: true }),
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({ access_token: "opaque", token_type: "Bearer" }),
      },
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

  it("rejects bearer credentials supplied through the query string", async () => {
    const authenticate = vi.fn();
    const handler = createAuthProviderMcpHandler(
      async () => Response.json({ ok: true }),
      {
        resource: "https://mcp.example.com/mcp",
        provider: { authenticate },
      },
    );
    const response = await handler(
      new Request("https://mcp.example.com/mcp?access_token=query-secret"),
    );
    expect(response.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns an insufficient-scope challenge before invoking MCP", async () => {
    const downstream = vi.fn(async () => Response.json({ ok: true }));
    const handler = createAuthProviderMcpHandler(downstream, {
      resource: "https://mcp.example.com/mcp",
      requiredScopes: ["mcp:read", "skills:read"],
      provider: {
        authenticate: async () => ({
          id: "client-1",
          type: "oauth",
          subject: { actorId: "user-1", actorType: "user" },
          scopes: ["mcp:read"],
        }),
      },
    });
    const response = await handler(
      new Request("https://mcp.example.com/mcp", {
        headers: { authorization: "Bearer opaque-token" },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"',
    );
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="mcp:read skills:read"',
    );
    expect(downstream).not.toHaveBeenCalled();
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
