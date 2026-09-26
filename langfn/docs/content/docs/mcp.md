---
title: MCP integration
description: Expose selected LangFn tools through McpFn.
---

`langfn/mcp` provides a server adapter that registers LangFn tools with McpFn, plus client and stdio/Streamable HTTP helpers (the historically named `SSEMCPTransport` wraps the MCP SDK’s `StreamableHTTPClientTransport`, not legacy SSE). Each registered tool uses its declared name, description, input schema, annotations, and LangFn `ToolPolicy`. Expose only tools whose effects and credentials are authorized for the connected caller.

The adapter can produce a manifest and serve supported transports. Treat model and tool inputs as untrusted, apply policy before execution, and keep long-lived credentials outside tool arguments. The [MCP source](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/mcp/server.ts) defines the current registration and transport behavior.
