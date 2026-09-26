---
title: Migrate or adopt incrementally
description: Move a custom MCP server to McpFn or test it without changing its runtime.
---

You can adopt `@mcpfn/testing`, `@mcpfn/client`, and `@mcpfn/cli` against an existing conforming stdio or Streamable HTTP server. `mcpfn test-target` and `mcpfn conformance` do not require a McpFn registry on the server side. This is the quickest path to semantic and wire-protocol regression evidence.

To migrate the runtime, preserve the existing public tool names and descriptions while replacing hand-written protocol dispatch with a `McpFnRegistry` and an SDK-backed server. Declare object input schemas, accurate annotations, output schemas where structured results matter, and trusted context at the transport boundary. Run manifest diffs and scenarios before switching traffic.

For protected HTTP, add a resource-server wrapper and keep the current identity and token authority. Hosted authorization composition does not move outbound provider OAuth or account-linking into McpFn. Declare host requirements for roots, sampling, elicitation, and MCP Apps before release.

The [migration source guide](https://github.com/21nCo/super-functions/blob/dev/mcpfn/MIGRATION.md) gives the full sequence, including edge deployment and current Superfunctions migration boundaries. The [testing guide](/docs/testing) explains the evidence to retain at each step.
