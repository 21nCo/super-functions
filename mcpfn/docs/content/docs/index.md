---
title: McpFn documentation
description: Consumer guide to building, connecting to, securing, and testing MCP servers.
---

McpFn provides a validated Model Context Protocol server runtime, a production client, OAuth integration, contract testing, inspection, and a command-line workflow. It delegates the wire protocol and transports to the official MCP SDK. You can adopt its testing and client packages against an existing MCP server without migrating that server to McpFn.

## Choose a path

- [Build a server](/docs/getting-started): declare a tool and serve it over stdio or Streamable HTTP.
- [Connect a client](/docs/client): select a target, manage the session, and list or call capabilities.
- [Protect HTTP](/docs/authorization): add protected-resource metadata, bearer verification, and client OAuth.
- [Prevent regressions](/docs/testing): compare manifests and run scenarios, authentication checks, and conformance.
- [Integrate DataFn](/docs/reference/datafn): expose only approved data operations as tools.

## Packages

| Package | Use it for |
| --- | --- |
| `@mcpfn/core` | Server declarations, runtime, registry, manifests, profiles, and MCP Apps contracts |
| `@mcpfn/client` | Stdio and Streamable HTTP client sessions |
| `@mcpfn/auth` | OAuth clients, protected resources, and hosted authorization composition |
| `@mcpfn/testing` | Protocol scenarios, client-profile contracts, auth fixtures, and Playwright flows |
| `@mcpfn/inspector` | Headless capability inspection and redacted scenario export |
| `@mcpfn/datafn` | Explicit, bounded DataFn-to-MCP tool projection |
| `@mcpfn/cli` | Manifest, diff, test, inspect, authorization, and conformance commands |

The [package reference](/docs/reference) includes the source-aligned README for every package, architecture details, and the full CI guide. Install only the packages your application uses. Node.js 18.18 or newer supports normal McpFn commands; the pinned official conformance runner requires Node.js 22 or newer.
