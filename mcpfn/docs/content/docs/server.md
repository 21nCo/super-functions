---
title: Build a server
description: Registry, context, profiles, resources, prompts, tasks, and transports.
---

## Keep the public contract explicit

Register tool names, descriptions, input and output JSON Schemas, and annotations deliberately. McpFn validates arguments and structured results and produces a deterministic manifest. Storage tables and internal methods should not become public tools by default. `defineMcpFnServer()` is a side-effect-free declaration; `createMcpFnServer()` remains supported for applications that construct the runtime directly.

Use `registerResource`, `registerResourceTemplate`, and `registerPrompt` on the registry for non-tool capabilities. Completers advertise completion support. Resource subscriptions, tasks, roots, sampling, elicitation, logging, and list-change notifications are available through the runtime. Declare required client features in `clientRequirements` so host compatibility can be checked before release.

## Derive trusted context at the transport boundary

The `context` factory receives SDK request metadata. Resolve the authenticated principal, tenant, scopes, and credential there. Do not accept those values from tool arguments.

```ts
const server = declaration.createServer({
  context: (extra) => resolvePrincipal(extra.authInfo),
  toolVisibility: ({ tool, context }) =>
    context.permissions.includes(String(tool._meta?.permission)),
});
```

`toolVisibility` affects both listing and calls. A hidden call returns the same protocol `MethodNotFound` result as an unknown tool; the static manifest still describes the complete server contract. See the [core reference](/docs/reference/core) for error envelopes and context details.

## Match authenticated client profiles carefully

`clientProfiles` can project an effective tool catalog for a verified client and inject server-owned required arguments from trusted context. Profile matching uses `McpFnVerifiedClientIdentity`, not a client-reported name or version. McpFn applies canonical visibility, checks the effective catalog, rejects client-supplied server-owned fields, enriches from the server context, then validates against the canonical schema. The [core reference](/docs/reference/core) includes the complete profile example and schema restrictions.

## Serve over the right transport

Use `serveStdio()` for process-launched clients. Use `createWebStandardHandler()` for Streamable HTTP and wrap protected endpoints with [OAuth resource-server handling](/docs/authorization). A server instance connects to one transport; share the declaration or registry and create an instance per connection. Sessionful HTTP needs a cryptographically secure `sessionIdGenerator` for correlated server-to-client requests such as sampling and elicitation.

McpFn Apps helpers validate `ui://` resource MIME type, CSP metadata, visibility, and tool links. The consuming host owns iframe rendering. The [architecture reference](/docs/reference/architecture) explains each boundary.
