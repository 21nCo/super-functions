import { describe, expect, it, vi } from "vitest";
import { createRouter } from "@superfunctions/http";
import type {
  OAuthFlowCallbackResult,
  OAuthFlowConnectionCleanup,
  OAuthFlowDisconnectResult,
  OAuthFlowService,
  OAuthFlowStartResult
} from "@superfunctions/oauth-flow";
import { createOAuthBrowserRoutes, createOAuthConnectionRoutes } from "../index.js";

function createFlowServiceMocks() {
  const start = vi.fn(async () => ({
    providerId: "google",
    authorizationUrl: "https://accounts.google.example/auth?state=st_01",
    stateId: "st_01",
    expiresAt: "2026-01-01T00:10:00.000Z"
  } satisfies OAuthFlowStartResult));

  const handleCallback = vi.fn(async () => ({
    providerId: "google",
    subject: {
      kind: "browser-auth",
      intentId: "intent_01",
      returnTo: "https://app.example/post-auth"
    },
    tokenSet: {
      accessToken: "access_01"
    }
  } satisfies OAuthFlowCallbackResult));

  const disconnect = vi.fn(async () => ({
    disconnected: true,
    remoteRevokeAttempted: true,
    localTokenDeleted: true,
    connectionCleanup: {
      attempted: true,
      deleted: true,
      reason: "deleted"
    } satisfies OAuthFlowConnectionCleanup,
    connectionDeleted: true
  } satisfies OAuthFlowDisconnectResult));

  const refresh = vi.fn(async () => ({
    accessToken: "access_refreshed"
  }));

  return {
    service: {
      start,
      handleCallback,
      disconnect,
      refresh
    } satisfies OAuthFlowService,
    start,
    handleCallback,
    disconnect
  };
}

describe("oauth-router route factories", () => {
  it("creates reusable browser-auth routes with the expected path inventory", () => {
    const { service } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });

    expect(routes.map((route) => route.path)).toEqual([
      "/auth/social/start",
      "/auth/social/callback/:provider",
      "/auth/social/disconnect/:provider"
    ]);
    expect(routes.map((route) => route.meta?.auth?.mode)).toEqual(["none", "none", "hybrid"]);
  });

  it("applies secure default auth metadata for connection routes", () => {
    const { service } = createFlowServiceMocks();
    const routes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });

    expect(routes.map((route) => route.path)).toEqual([
      "/oauth/connections/start",
      "/oauth/connections/callback/:provider",
      "/oauth/connections/disconnect/:provider"
    ]);
    expect(routes.map((route) => route.meta?.auth?.mode)).toEqual(["hybrid", "none", "hybrid"]);
  });

  it("allows explicit per-route auth metadata overrides", () => {
    const { service } = createFlowServiceMocks();
    const browserRoutes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never,
      routeMeta: {
        disconnect: {
          auth: {
            mode: "none"
          }
        }
      }
    });
    const connectionRoutes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never,
      routeMeta: {
        start: {
          auth: {
            mode: "bearer",
            scopes: ["connections:write"]
          }
        },
        disconnect: {
          auth: {
            mode: "cookie-session",
            csrf: true
          }
        }
      }
    });

    expect(browserRoutes.map((route) => route.meta?.auth?.mode)).toEqual(["none", "none", "none"]);
    expect(connectionRoutes.map((route) => route.meta?.auth?.mode)).toEqual(["bearer", "none", "cookie-session"]);
    expect(connectionRoutes[0]?.meta?.auth?.scopes).toEqual(["connections:write"]);
    expect(connectionRoutes[2]?.meta?.auth?.csrf).toBe(true);
  });

  it("supports browser callback JSON completion mode and propagates request ids", async () => {
    const { service, start, handleCallback, disconnect } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const startResponse = await router.handle(
      new Request("http://localhost/auth/social/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_start_json"
        },
        body: JSON.stringify({
          providerId: "google",
          redirectUri: "https://app.example/callback",
          subject: {
            kind: "browser-auth",
            intentId: "intent_01"
          }
        })
      })
    );

    expect(startResponse.status).toBe(200);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        requestId: "req_start_json"
      })
    );

    const callbackResponse = await router.handle(
      new Request(
        "http://localhost/auth/social/callback/google?code=code_01&state=st_01&redirectUri=https%3A%2F%2Fapp.example%2Fcallback",
        {
          headers: { "x-request-id": "req_callback_json" }
        }
      )
    );

    expect(callbackResponse.status).toBe(200);
    expect(handleCallback).toHaveBeenCalledWith({
      providerId: "google",
      code: "code_01",
      state: "st_01",
      redirectUri: "https://app.example/callback",
      requestId: "req_callback_json"
    });

    const callbackPayload = await callbackResponse.json();
    expect(callbackPayload.providerId).toBe("google");

    const disconnectResponse = await router.handle(
      new Request("http://localhost/auth/social/disconnect/google", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_disconnect_json"
        },
        body: JSON.stringify({
          connectionId: "conn_01",
          revokeRemote: true
        })
      })
    );

    expect(disconnectResponse.status).toBe(200);
    expect(disconnect).toHaveBeenCalledWith({
      providerId: "google",
      connectionId: "conn_01",
      revokeRemote: true,
      tokenTypeHint: undefined,
      requestId: "req_disconnect_json"
    });
  });

  it("supports browser callback redirect completion mode and plain connection routes", async () => {
    const browser = createFlowServiceMocks();
    const browserRoutes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: browser.service,
      resolveStartInput: async (request) => (await request.json()) as never,
      callbackMode: "redirect",
      // The mocked returnTo is cross-origin (https://app.example) relative to
      // the http://localhost request, so it must be explicitly allowlisted.
      allowedRedirectOrigins: ["https://app.example"]
    });
    const browserRouter = createRouter({ routes: browserRoutes });

    const redirectResponse = await browserRouter.handle(
      new Request(
        "http://localhost/auth/social/callback/google?code=code_02&state=st_01&redirectUri=https%3A%2F%2Fapp.example%2Fcallback"
      )
    );

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get("location")).toBe("https://app.example/post-auth");

    const connection = createFlowServiceMocks();
    const connectionRoutes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: connection.service,
      resolveStartInput: async (request) => (await request.json()) as never
    });

    expect(connectionRoutes.map((route) => route.path)).toEqual([
      "/oauth/connections/start",
      "/oauth/connections/callback/:provider",
      "/oauth/connections/disconnect/:provider"
    ]);
    expect(connectionRoutes.map((route) => route.meta?.auth?.mode)).toEqual(["hybrid", "none", "hybrid"]);
  });

  it("uses an absolute fallback redirect URL when browser callback completion has no returnTo", async () => {
    const browser = createFlowServiceMocks();
    browser.handleCallback.mockResolvedValue({
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_01"
      },
      tokenSet: {
        accessToken: "access_01"
      }
    } satisfies OAuthFlowCallbackResult);

    const browserRoutes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: browser.service,
      resolveStartInput: async (request) => (await request.json()) as never,
      callbackMode: "redirect"
    });
    const browserRouter = createRouter({ routes: browserRoutes });

    const redirectResponse = await browserRouter.handle(
      new Request("https://app.example/auth/social/callback/google?code=code_02&state=st_01")
    );

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get("location")).toBe("https://app.example/");
  });

  it("blocks open-redirects to cross-origin returnTo values that are not allowlisted", async () => {
    const browser = createFlowServiceMocks();
    // The mocked returnTo is https://app.example/post-auth, cross-origin to the
    // http://localhost request and NOT in allowedRedirectOrigins.
    const browserRoutes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: browser.service,
      resolveStartInput: async (request) => (await request.json()) as never,
      callbackMode: "redirect"
    });
    const browserRouter = createRouter({ routes: browserRoutes });

    const redirectResponse = await browserRouter.handle(
      new Request("http://localhost/auth/social/callback/google?code=code_02&state=st_01")
    );

    expect(redirectResponse.status).toBe(302);
    // Falls back to the request-origin root instead of the attacker origin.
    expect(redirectResponse.headers.get("location")).toBe("http://localhost/");
  });

  it("falls back to the request origin for non-HTTP returnTo schemes", async () => {
    const browser = createFlowServiceMocks();
    browser.handleCallback.mockResolvedValue({
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_01",
        returnTo: "javascript:alert('xss')"
      },
      tokenSet: { accessToken: "access_01" }
    });
    const browserRoutes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: browser.service,
      resolveStartInput: async (request) => (await request.json()) as never,
      callbackMode: "redirect"
    });

    const response = await createRouter({ routes: browserRoutes }).handle(
      new Request("http://localhost/auth/social/callback/google?code=code_02&state=st_01")
    );

    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("rejects invalid allowedRedirectOrigins during route construction", () => {
    const browser = createFlowServiceMocks();
    expect(() => createOAuthBrowserRoutes({
        basePath: "/auth/social",
        flowService: browser.service,
        resolveStartInput: async (request) => (await request.json()) as never,
        callbackMode: "redirect",
        allowedRedirectOrigins: ["not a URL", "https://app.example"]
      })).toThrow("OAUTH_ALLOWED_REDIRECT_ORIGIN_INVALID: not a URL");
  });

  it("preserves resolver-provided requestId when the start header is absent", async () => {
    const { service, start } = createFlowServiceMocks();
    const routes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: service,
      resolveStartInput: async () => ({
        providerId: "google",
        tenantId: "tenant_1",
        userId: "user_1",
        redirectUri: "https://app.example/callback",
        requestId: "req_from_resolver"
      })
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/oauth/connections/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      })
    );

    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req_from_resolver"
      })
    );
  });

  it("preserves resolver-provided requestId for browser start routes when the header is absent", async () => {
    const { service, start } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async () => ({
        providerId: "google",
        subject: {
          kind: "browser-auth",
          intentId: "intent_01",
          returnTo: "https://app.example/post-auth",
        },
        redirectUri: "https://app.example/callback",
        requestId: "req_from_browser_resolver",
      }),
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/auth/social/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );

    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req_from_browser_resolver",
      })
    );
  });

  it("derives callback redirectUri from the current request URL when none is provided explicitly", async () => {
    const { service, handleCallback } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("https://app.example/auth/social/callback/google?code=code_03&state=st_03")
    );

    expect(response.status).toBe(200);
    expect(handleCallback).toHaveBeenCalledWith({
      providerId: "google",
      code: "code_03",
      state: "st_03",
      redirectUri: "https://app.example/auth/social/callback/google",
      requestId: undefined
    });
  });

  it("preserves non-transient callback query params when inferring redirectUri", async () => {
    const { service, handleCallback } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request(
        "https://app.example/auth/social/callback/google?tenant=tenant_01&code=code_05&state=st_05"
      )
    );

    expect(response.status).toBe(200);
    expect(handleCallback).toHaveBeenCalledWith({
      providerId: "google",
      code: "code_05",
      state: "st_05",
      redirectUri: "https://app.example/auth/social/callback/google?tenant=tenant_01",
      requestId: undefined
    });
  });

  it("rejects explicitly empty callback redirectUri values", async () => {
    const { service } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never,
      resolveCallbackInput: async () => ({
        code: "code_04",
        state: "st_04",
        redirectUri: ""
      })
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("https://app.example/auth/social/callback/google")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "redirectUri is required",
      code: "OAUTH_ROUTE_INVALID_INPUT",
    });
  });

  it("rejects invalid disconnect payload fields before calling disconnect", async () => {
    const { service, disconnect } = createFlowServiceMocks();
    const routes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/oauth/connections/disconnect/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: "conn_01",
          revokeRemote: "false"
        })
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "revokeRemote must be a boolean",
      code: "OAUTH_ROUTE_INVALID_INPUT",
    });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("rejects non-string required route fields before calling disconnect", async () => {
    const { service, disconnect } = createFlowServiceMocks();
    const routes = createOAuthConnectionRoutes({
      basePath: "/oauth/connections",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/oauth/connections/disconnect/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: 123,
          revokeRemote: true
        })
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "connectionId is required",
      code: "OAUTH_ROUTE_INVALID_INPUT",
    });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("rejects invalid browser disconnect payload fields before calling disconnect", async () => {
    const { service, disconnect } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/auth/social/disconnect/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: "conn_01",
          tokenTypeHint: "bad_hint"
        })
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "tokenTypeHint must be access_token or refresh_token",
      code: "OAUTH_ROUTE_INVALID_INPUT",
    });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("rejects null browser disconnect payloads before calling disconnect", async () => {
    const { service, disconnect } = createFlowServiceMocks();
    const routes = createOAuthBrowserRoutes({
      basePath: "/auth/social",
      flowService: service,
      resolveStartInput: async (request) => (await request.json()) as never
    });
    const router = createRouter({ routes });

    const response = await router.handle(
      new Request("http://localhost/auth/social/disconnect/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "null"
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "disconnect body must be a JSON object",
      code: "OAUTH_ROUTE_INVALID_INPUT",
    });
    expect(disconnect).not.toHaveBeenCalled();
  });
});
