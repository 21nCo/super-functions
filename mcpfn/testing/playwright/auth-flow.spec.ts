import {
  exchangeAuthorizationCode,
  expect,
  refreshOAuthAccessToken,
  revokeOAuthToken,
  test,
} from "../src/playwright.js";

test("runs a browser PKCE flow for extensible client metadata", async ({
  page,
  mcpfnOAuth,
}) => {
  const clientId = mcpfnOAuth.server.clientMetadataUrl("jwtBearerExtension");
  const authorization = await mcpfnOAuth.authorize(page, {
    clientId,
    scopes: ["mcp:read"],
    resource: "https://mcp.example.com/mcp",
  });
  const code = authorization.callback.parameters.code;
  expect(code).toBeTruthy();

  const tokens = await exchangeAuthorizationCode({
    tokenEndpoint: mcpfnOAuth.server.tokenEndpoint,
    clientId,
    redirectUri: mcpfnOAuth.server.callbackUrl,
    code,
    codeVerifier: authorization.pkce.verifier,
  });
  const verified = await mcpfnOAuth.server.verifyAccessToken(tokens.access_token);
  expect(verified).toMatchObject({
    clientId,
    scopes: ["mcp:read"],
  });
  expect(verified.resource?.href).toBe("https://mcp.example.com/mcp");

  const refreshed = await refreshOAuthAccessToken({
    tokenEndpoint: mcpfnOAuth.server.tokenEndpoint,
    clientId,
    refreshToken: tokens.refresh_token,
  });
  await revokeOAuthToken({
    revocationEndpoint: mcpfnOAuth.server.revocationEndpoint,
    token: refreshed.access_token,
  });
  await expect(mcpfnOAuth.server.verifyAccessToken(refreshed.access_token)).rejects.toThrow(
    "Invalid access token",
  );
});
