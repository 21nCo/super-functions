---
title: Authorization
description: Protect Streamable HTTP, complete client OAuth, and compose hosted authorization.
---

# Authorization

McpFn has three separate authorization roles: verify bearer credentials at a protected MCP resource, act as an OAuth client, and compose an existing hosted identity system into MCP authorization endpoints. Install `@mcpfn/auth` for the roles you need.

## Protect an HTTP MCP resource

Wrap the Web Standard MCP handler and supply a token verifier, canonical resource identifier, authorization-server URL, and required scopes:

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

The wrapper publishes protected-resource metadata and passes verified auth information to server context. Keep identity, tenant, scopes, and resource binding out of model-controlled arguments. The [authorization reference](/docs/reference/auth) covers the generic provider adapter and diagnostic entry points.

## Complete client OAuth

`createMcpFnOAuthClientProvider()` implements the official provider contract. It validates redirects before browser launch, correlates callback state, and defaults to in-memory PKCE and token storage. Pass an encrypted application-provided store when persistence is needed. Native private-use redirects follow RFC 8252's reverse-domain policy by default; compatibility schemes need an explicit allowlist. The client completes the code exchange only after both `code` and `state` are supplied.

## Reuse hosted identity

`createMcpAuthorizationCompatibilityHandler()` composes authorization-server metadata, registration, Client ID Metadata Documents, PKCE code validation, token exchange, refresh rotation, and revocation. The host remains responsible for login, consent, durable clients, token signing and values, and revocation state. This is separate from outbound provider account-linking flows.

Run `mcpfn auth-diagnose URL` for read-only discovery checks. Add the [authentication regression suite](/docs/testing) before deploying a protected endpoint.
