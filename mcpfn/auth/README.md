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

Native private-use redirects use RFC 8252's reverse-domain scheme policy by
default, accepting values such as `com.example.app:/oauth/callback`. Hosts can
set `redirectPolicy.privateUseSchemePolicy: "disabled"` to reject all native
schemes, or opt into `"compatible"` for well-formed non-web schemes used by
native clients and name those schemes explicitly, for example
`compatiblePrivateUseSchemes: ["cursor"]` for
`cursor://anysphere.cursor-mcp/oauth/callback`. Compatibility mode still rejects
web, network, launcher, and dangerous schemes, non-loopback HTTP, credentials,
fragments, wildcards, and malformed or opaque callbacks. Authorization always
requires exact matching; dynamic-port matching remains restricted to loopback
HTTP. Successful dynamic
registrations expose compatibility scheme names and counts through the hosted
authorization diagnostics hook so hosts can audit use without recording callback
queries.

The deprecated `allowPrivateUseSchemes` boolean remains accepted for 0.0.3
callers: `false` maps to `disabled` and `true` maps to `rfc8252`. When neither
field is provided, 0.0.4 defaults to `rfc8252`.

## Hosted compatibility

`createMcpAuthorizationCompatibilityHandler()` publishes authorization-server
metadata and composes DCR, pre-registration, Client ID Metadata Documents,
authorization-code + PKCE request validation, typed token exchange, serialized
refresh rotation, and revocation endpoints. Metadata is derived from the token
authority callbacks and declared client-auth methods, so unsupported grants or
methods are never advertised. McpFn parses and validates endpoint requests;
the host application's callbacks remain authoritative for login, consent,
durable clients, code issuance, signing, token values, and revocation state.
External Client ID Metadata Documents require an explicit URL allow-policy.
McpFn disables automatic redirects, reapplies that policy at every redirect,
streams responses through a byte cap, and applies a ten-second deadline by
default. `maxBytes`, `timeoutMs`, and `maxRedirects` can tighten those bounds.

The AuthFn adapter uses a structural provider contract. `@superfunctions/auth`
is an optional peer: installing or importing AuthFn is not required for other
client, resource-server, or hosted authorization features.

`createMcpFnAuthProviderAdapter()` maps a generic `@superfunctions/auth`
session into official MCP `authInfo`, keeping identity, tenant, scopes, and
resources out of model-controlled tool arguments. Bearer credentials are
required. A bearer-specific provider can implement
`authenticateBearer(token, request)` directly; a standard AuthFn
`authenticate(request)` provider is invoked with a credential-isolated request
containing only that exact Bearer token. An AuthProvider's `authorize()` hook
receives the normalized MCP resource URL before trusted context is created. `auth-diagnose` and
`diagnoseMcpAuthorization()` perform read-only discovery without browser or
credential actions.
