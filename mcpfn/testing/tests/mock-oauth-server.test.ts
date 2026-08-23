import { afterEach, describe, expect, it } from "vitest";

import {
  createPkcePair,
  startMockOAuthAuthorizationServer,
  type McpFnStartedMockOAuthServer,
} from "../src/auth.js";

describe("McpFn mock OAuth authorization server", () => {
  let started: McpFnStartedMockOAuthServer | undefined;
  afterEach(async () => {
    await started?.close();
    started = undefined;
  });

  it("runs authorization-code PKCE, refresh rotation, revocation, and extensible CIMD", async () => {
    started = await startMockOAuthAuthorizationServer();
    const oauth = started.oauth;
    const metadata = await fetch(oauth.metadataUrl).then((response) => response.json());
    expect(metadata).toMatchObject({
      issuer: `${started.origin}/`,
      authorization_endpoint: oauth.authorizationEndpoint,
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
    });

    const clientId = oauth.clientMetadataUrl("deviceCodeExtension");
    const clientMetadata = await fetch(clientId).then((response) => response.json()) as {
      grant_types: string[];
    };
    expect(clientMetadata.grant_types).toContain(
      "urn:ietf:params:oauth:grant-type:device_code",
    );

    const pkce = createPkcePair();
    const authorizationUrl = new URL(oauth.authorizationUrl({
      clientId,
      codeChallenge: pkce.challenge,
      state: "state-1",
      scopes: ["mcp:read"],
      resource: "https://mcp.example.com/mcp",
    }));
    const consent = await fetch(authorizationUrl, { redirect: "manual" });
    expect(consent.status).toBe(200);
    await expect(consent.text()).resolves.toContain("Authorize MCP client");

    authorizationUrl.searchParams.set("decision", "approve");
    const approval = await fetch(authorizationUrl, { redirect: "manual" });
    expect(approval.status).toBe(302);
    const callback = new URL(approval.headers.get("location") ?? "");
    expect(callback.searchParams.get("state")).toBe("state-1");
    const code = callback.searchParams.get("code") ?? "";

    const exchange = () => fetch(oauth.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: oauth.callbackUrl,
        code,
        code_verifier: pkce.verifier,
      }),
    });
    const tokenResponse = await exchange();
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      resource: string;
    };
    const verified = await oauth.verifyAccessToken(tokens.access_token);
    expect(verified).toMatchObject({
      clientId,
      scopes: ["mcp:read"],
    });
    expect(verified.resource?.href).toBe("https://mcp.example.com/mcp");
    expect((await exchange()).status).toBe(400);

    const refresh = () => fetch(oauth.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      }),
    });
    const refreshResponse = await refresh();
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json() as { access_token: string };
    expect((await refresh()).status).toBe(400);

    expect((await fetch(oauth.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password" }),
    })).status).toBe(400);

    await fetch(oauth.revocationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshed.access_token }),
    });
    await expect(oauth.verifyAccessToken(refreshed.access_token)).rejects.toThrow(
      "Invalid access token",
    );
  });
});
