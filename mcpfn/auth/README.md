# `@mcpfn/auth`

OAuth integration for MCP clients, resource servers, and hosted authorization
systems. Protocol mechanics remain in the official MCP SDK.

```ts
import { createOAuthResourceServerHandler } from "@mcpfn/auth";

const mcp = await server.createWebStandardHandler({ enableJsonResponse: true });
const fetch = createOAuthResourceServerHandler(mcp, {
  resource: "https://api.example.com/mcp",
  authorizationServers: ["https://login.example.com"],
  scopesSupported: ["mcp:read"],
  requiredScopes: ["mcp:read"],
  verifier,
});
```

Enterprise-managed authorization helpers advertise the stable ID-JAG grant profile in authorization-server metadata and build the request metadata used by supporting clients.

## Client provider

`createMcpFnOAuthClientProvider()` implements the official
`OAuthClientProvider`. It validates the requested redirect against registered
metadata before opening a browser, correlates callback state, stores PKCE and
tokens in memory unless an encrypted store is supplied, classifies token
exchange/refresh/revocation diagnostics, and redacts credentials.

```ts
const provider = createMcpFnOAuthClientProvider({
  redirectUrl: "http://127.0.0.1/callback",
  clientMetadata: {
    redirect_uris: ["http://127.0.0.1/callback"],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
  },
  openAuthorization: (url) => browser.open(url),
});
```

Pass it to `streamableHttpTarget`. Complete interactive authorization with
`client.completeAuthorization({ code, state })`; a missing or mismatched state
fails before token exchange. Dynamic loopback ports are accepted only when the
registered URI omits the port. Other redirect URIs require exact equality.

## Hosted compatibility

`createMcpAuthorizationCompatibilityHandler()` publishes authorization-server
metadata and composes DCR, pre-registration, Client ID Metadata Documents,
authorization-code + PKCE request validation, token, and revocation endpoints.
The host application's callbacks remain authoritative for login, consent,
durable clients, code issuance, signing, refresh rotation, and revocation.
External Client ID Metadata Documents require an explicit URL allow-policy.

`createMcpFnAuthProviderAdapter()` maps a generic `@superfunctions/auth`
session into official MCP `authInfo`, keeping identity, tenant, scopes, and
resources out of model-controlled tool arguments. `auth-diagnose` and
`diagnoseMcpAuthorization()` perform read-only discovery without browser or
credential actions.
