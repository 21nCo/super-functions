import { describe, expect, it } from "vitest";
import {
  createMcpAuthorizationCompatibilityHandler,
  normalizeMcpClientRegistration,
  type McpFnNormalizedClientRegistration,
} from "@mcpfn/auth";

import {
  createHostedAuthorizationFixtures,
  runHostedAuthorizationRegression,
} from "../src/index.js";

describe("hosted role-3 regression harness", () => {
  it("keeps registration and request inputs independent across named hosts and grant errors", async () => {
    const issuer = "https://login.example.com";
    const resource = "https://mcp.example.com/mcp";
    const registrations = new Map<string, McpFnNormalizedClientRegistration>();
    const handler = createMcpAuthorizationCompatibilityHandler({
      issuer,
      clients: {
        resolve: async (clientId) => registrations.get(clientId) ?? null,
      },
      allowedResources: [resource],
      capabilities: { requireRefreshResource: true },
      supportedScopes: ["mcp:read"],
      authorize: async (input) => {
        const callback = new URL(input.redirectUri);
        callback.searchParams.set("code", `${input.client.clientId}-code`);
        if (input.state) callback.searchParams.set("state", input.state);
        return Response.redirect(callback, 302);
      },
      tokenAuthority: {
        exchangeAuthorizationCode: async () => ({
          access_token: "role3-access-token",
          token_type: "Bearer",
          refresh_token: "role3-refresh-token",
        }),
        refreshToken: async () => ({
          access_token: "role3-refreshed-token",
          token_type: "Bearer",
          refresh_token: "role3-rotated-token",
        }),
      },
    });
    const fixtures = createHostedAuthorizationFixtures({ issuer, resource });
    const drift = fixtures.find((fixture) => fixture.id === "chatgpt-unregistered-redirect")!;
    expect(drift.registration.metadata.redirect_uris).not.toContain(
      drift.authorization.redirectUri,
    );

    const results = await runHostedAuthorizationRegression({
      issuer,
      async prepareRegistration(fixture) {
        registrations.set(fixture.clientId, normalizeMcpClientRegistration(fixture));
      },
      request: handler,
    }, fixtures);

    expect(results).toHaveLength(6);
    expect(results.filter((result) => result.status !== "passed")).toEqual([]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "claude-client-metadata-extensible-grants",
        phase: "token-refresh",
      }),
      expect.objectContaining({
        id: "chatgpt-unregistered-redirect",
        errorCode: "invalid_request",
        phase: "authorization-request",
      }),
      expect.objectContaining({
        id: "actual-unsupported-token-grant",
        errorCode: "unsupported_grant_type",
        phase: "token-exchange",
      }),
    ]));
  });
  it.each(["throw", "no-redirect", "missing-code", "wrong-state", "wrong-callback", "empty-token", "token-redirect"])("fails broken hosted flow: %s", async (fault) => {
    const issuer = "https://login.example.com";
    const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" })[0]!;
    const results = await runHostedAuthorizationRegression({
      issuer, prepareRegistration: async () => {},
      request: async (request) => {
        if (fault === "throw") throw new Error("transport aborted");
        if (new URL(request.url).pathname.endsWith("authorize")) {
          if (fault === "no-redirect") return new Response("", { status: 200 });
          const callback = new URL(fault === "wrong-callback" ? "https://evil.example/callback" : fixture.authorization.redirectUri);
          if (fault !== "missing-code") callback.searchParams.set("code", "real-code");
          callback.searchParams.set("state", fault === "wrong-state" ? "wrong" : fixture.authorization.state);
          return Response.redirect(callback, 302);
        }
        expect(request.redirect).toBe("manual");
        if (fault === "token-redirect") return Response.redirect("https://evil.example/token", 307);
        return Response.json(fault === "empty-token" ? {} : { access_token: "valid-token", token_type: "Bearer", refresh_token: "valid-refresh" });
      },
    }, [fixture]);
    expect(results[0]?.status).toBe("failed");
  });

});

it.each(["status", "state", "destination"])("rejects malformed OAuth rejection %s", async (fault) => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" })[0]!;
  fixture.expected = { outcome: "rejected", errorCode: "invalid_request" };
  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {},
    request: async () => {
      if (fault === "status") return Response.json({ error: "invalid_request" });
      const callback = new URL(fault === "destination" ? "https://evil.example/cb" : fixture.authorization.redirectUri);
      callback.searchParams.set("error", "invalid_request");
      callback.searchParams.set("state", fault === "state" ? "wrong" : fixture.authorization.state);
      return Response.redirect(callback, 302);
    },
  }, [fixture]);
  expect(results[0]?.status).toBe("failed");
});


it.each([304, 305])("rejects status %s as an OAuth error redirect", async (status) => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" })[0]!;
  fixture.expected = { outcome: "rejected", errorCode: "invalid_request" };
  const callback = new URL(fixture.authorization.redirectUri);
  callback.searchParams.set("error", "invalid_request"); callback.searchParams.set("state", fixture.authorization.state);
  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {}, request: async () => new Response(null, { status, headers: { location: callback.toString() } }) }, [fixture]);
  expect(results[0]?.status).toBe("failed");
});

it.each([400, 401, 403])("rejects a Location-only token error with status %s", async (status) => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" }).find((item) => item.id === "actual-unsupported-token-grant")!;
  const callback = new URL(fixture.authorization.redirectUri);
  callback.searchParams.set("code", "test-code"); callback.searchParams.set("state", fixture.authorization.state);
  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {}, request: async (request) =>
    new URL(request.url).pathname.endsWith("authorize") ? Response.redirect(callback, 302) : new Response(null, { status, headers: { location: "https://login.example.com/error?error=unsupported_grant_type" } })
  }, [fixture]);
  expect(results[0]?.status).toBe("failed");
});

it.each([[400, 'application/json', 'passed'], [400, 'Application/JSON; charset=utf-8', 'passed'], [401, 'application/json', 'failed'], [403, 'application/json', 'failed'], [400, 'text/notjson', 'failed']])('validates token rejection media type and status %s %s', async (status, contentType, outcome) => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" }).find(item => item.id === "actual-unsupported-token-grant")!;
  const callback = new URL(fixture.authorization.redirectUri);
  callback.searchParams.set("code", "test-code"); callback.searchParams.set("state", fixture.authorization.state);
  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {}, request: async request =>
    new URL(request.url).pathname.endsWith("authorize") ? Response.redirect(callback, 302) : new Response(JSON.stringify({ error: 'unsupported_grant_type' }), { status: status as number, headers: { 'content-type': contentType as string } })
  }, [fixture]);
  expect(results[0]?.status).toBe(outcome);
});


it("rejects direct authorization JSON 401 invalid_client", async () => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" })[0]!;
  fixture.expected = { outcome: "rejected", errorCode: "invalid_client" };
  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {}, request: async () =>
    new Response(JSON.stringify({ error: "invalid_client" }), { status: 401, headers: { "content-type": "application/json" } })
  }, [fixture]);
  expect(results[0]?.status).toBe("failed");
});

it.each(["token-exchange", "token-refresh"])("rejects non-JSON successful %s", async phase => {
  const issuer = "https://login.example.com";
  const fixture = createHostedAuthorizationFixtures({ issuer, resource: "https://mcp.example.com/mcp" }).find(item => item.token?.refreshAfterExchange)!;
  const callback = new URL(fixture.authorization.redirectUri);
  callback.searchParams.set("code", "test-code"); callback.searchParams.set("state", fixture.authorization.state);

  const results = await runHostedAuthorizationRegression({ issuer, prepareRegistration: async () => {}, request: async request => {
    if (new URL(request.url).pathname.endsWith("authorize")) return Response.redirect(callback, 302);
    const refresh = new URLSearchParams(await request.clone().text()).get("grant_type") === "refresh_token";
    return new Response(JSON.stringify({ access_token: "token", token_type: "Bearer", refresh_token: "refresh" }), { headers: { "content-type": refresh === (phase === "token-refresh") ? "text/plain" : "application/json" } });
  } }, [fixture]);
  expect(results[0]).toMatchObject({ status: "failed", phase, responseStatus: 200 });
});

it.each(["Bearer", "bEaReR", "MAC"])("validates hosted token type %s and reports actual final status", async tokenType => {
  const fixture = createHostedAuthorizationFixtures({issuer: "https://login.example.com", resource: "https://mcp.example.com/mcp"}).find(item => item.token?.refreshAfterExchange)!;
  const [result] = await runHostedAuthorizationRegression({issuer: "https://login.example.com", prepareRegistration: () => {}, request: async request => {
    if (new URL(request.url).pathname.endsWith("authorize")) {
      const callback = new URL(fixture.authorization.redirectUri); callback.searchParams.set("code", "code"); callback.searchParams.set("state", fixture.authorization.state);
      return Response.redirect(callback, 302);
    }
    return Response.json({access_token: "token", token_type: tokenType, refresh_token: "refresh"}, {status: 200});
  }}, [fixture]);
  expect(result.status).toBe(tokenType === "MAC" ? "failed" : "passed");
  if (tokenType !== "MAC") expect(result.responseStatus).toBe(200);
});
it("rejects a direct JSON authorization error for a registered callback", async () => {
  const fixture = createHostedAuthorizationFixtures({issuer: "https://login.example.com", resource: "https://mcp.example.com/mcp"})[0];
  fixture.expected = {outcome: "rejected", errorCode: "invalid_request"};
  const [result] = await runHostedAuthorizationRegression({issuer: "https://login.example.com", prepareRegistration: () => {}, request: async () => Response.json({error: "invalid_request"}, {status: 400})}, [fixture]);
  expect(result.status).toBe("failed");
});


it.each(['token-exchange', 'token-refresh'])('rejects HTTP 201 during %s and preserves status', async phase => {
  const fixture = createHostedAuthorizationFixtures({issuer: 'https://login.example.com', resource: 'https://mcp.example.com/mcp'}).find(item => item.token?.refreshAfterExchange)!;
  const [result] = await runHostedAuthorizationRegression({ issuer: 'https://login.example.com', prepareRegistration: () => {}, request: async request => {
    if (new URL(request.url).pathname.endsWith('authorize')) {
      const callback = new URL(fixture.authorization.redirectUri); callback.searchParams.set('code', 'code'); callback.searchParams.set('state', fixture.authorization.state);
      return Response.redirect(callback, 302);
    }
    const refresh = new URLSearchParams(await request.text()).get('grant_type') === 'refresh_token';
    return Response.json({ access_token: 'token', token_type: 'Bearer', refresh_token: 'refresh' }, { status: refresh === (phase === 'token-refresh') ? 201 : 200 });
  } }, [fixture]);
  expect(result).toMatchObject({ status: 'failed', phase, responseStatus: 201 });
});

it.each(["blank", "network", "embedded space", "invalid:character", "bad=padding"])("rejects invalid token evidence: %s", async mode => {
  const fixture = createHostedAuthorizationFixtures({issuer: "https://login.example.com", resource: "https://mcp.example.com/mcp"})[0];
  const [result] = await runHostedAuthorizationRegression({issuer: "https://login.example.com", prepareRegistration: () => {}, request: async request => {
    if (new URL(request.url).pathname.endsWith("authorize")) {
      const callback = new URL(fixture.authorization.redirectUri);
      callback.searchParams.set("code", "code"); callback.searchParams.set("state", fixture.authorization.state);
      return Response.redirect(callback, 302);
    }
    if (mode === "network") throw new Error("network failure");
    return Response.json({ access_token: mode === "blank" ? "   " : mode, token_type: "Bearer", refresh_token: "refresh" });
  }}, [fixture]);
  expect(result.status).toBe("failed");
  expect(result.responseStatus).toBe(mode === "network" ? undefined : 200);
});

it("rejects invalid-client errors even on a registered state-matching redirect", async () => {
  const fixture = createHostedAuthorizationFixtures({issuer: "https://login.example.com", resource: "https://mcp.example.com/mcp"}).find(item => item.expected.errorCode === "invalid_client")!;
  const [result] = await runHostedAuthorizationRegression({ issuer: "https://login.example.com", prepareRegistration: () => {}, request: async () => {
    const callback = new URL(fixture.authorization.redirectUri);
    callback.searchParams.set("error", "invalid_client"); callback.searchParams.set("state", fixture.authorization.state);
    return Response.redirect(callback, 302);
  } }, [fixture]);
  expect(result.status).toBe("failed");
});

it.each([null, undefined, false, 0, ""])( "records falsy adapter rejections without skipping remaining fixtures (%j)", async failure => {
  const fixtures = createHostedAuthorizationFixtures({ issuer: "https://login.example.com", resource: "https://mcp.example.com" });
  const results = await runHostedAuthorizationRegression({
    issuer: "https://login.example.com",
    prepareRegistration: async () => { throw failure; },
    request: async () => { throw new Error("unexpected request"); },
  }, fixtures);
  expect(results).toHaveLength(fixtures.length);
  expect(results.every(result => result.status === "failed")).toBe(true);
});
