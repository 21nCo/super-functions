---
title: Deployment
description: Run McpFn over HTTP on Node or Cloudflare Workers and keep the transport boundary secure.
---

Serve HTTP with `createWebStandardHandler()` and mount the resulting Web Standard handler in your application's router. The official SDK owns Streamable HTTP and protocol behavior. Wrap protected endpoints with `createOAuthResourceServerHandler()` and derive trusted context from verified request metadata. See [authorization](/docs/authorization) for the resource-server boundary.

## Stateless and sessionful HTTP

Stateless mode creates and disposes an isolated SDK server and transport for every request. For server-initiated operations that must correlate across requests, provide a cryptographically secure `sessionIdGenerator` and retain the session transport. A `configureRequestServer` hook runs before the transport connection and can attach protocol instrumentation; a rejected initialization can invoke it without retaining a session.

Initialization metadata is available only to sessionful client-profile hooks. Stateless profiles must be marked `requiresReportedClient: false` and depend on verified identity and request context. Keep a separate runtime instance per connection while sharing a registry or declaration.

## Cloudflare Workers

`@mcpfn/core` and `@mcpfn/auth` ship self-contained SDK bundles. Enable Cloudflare's `nodejs_compat` flag because the SDK uses Node built-ins such as `node:crypto`. Serve the Web Standard handler from the Worker. Do not import the Node-oriented client, CLI, testing, or inspector packages into the edge bundle.

Schema validation uses Ajv draft-07 on Node and `@cfworker/json-schema` in runtimes that forbid runtime code generation. The repository's `cloudflare:worker-startup` release-gate step boots this shape under `workerd` with a protected request. For the exact compatibility and bundling policy, see the [core reference](/docs/reference/core) and [architecture](/docs/reference/architecture).
