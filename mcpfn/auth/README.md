# `@mcpfn/auth`

Web Standard OAuth resource-server support for MCP servers.

It publishes RFC 9728 protected-resource metadata, validates Bearer tokens through the official SDK's `OAuthTokenVerifier` contract, enforces token expiry, resource indicators, and scopes, and passes trusted `authInfo` into the McpFn HTTP transport. Authorization-code, PKCE, DCR, and token issuance remain the authorization server's responsibility.

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
