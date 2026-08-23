# Migrating an MCP server to McpFn

## 1. Remove hand-written protocol dispatch

Keep domain handlers and schemas, but replace custom initialize, tools, resources, prompts, tasks, ping, stdio framing, and Streamable HTTP parsing with an `McpFnRegistry` and `McpFnServer`. The official SDK owns those protocol paths.

## 2. Register the existing public contract

Preserve tool names and descriptions unless the change is intentional. Use object JSON Schemas, declare `additionalProperties`, add accurate annotations, and add output schemas wherever consumers rely on structured results.

Handlers should return MCP `CallToolResult` values. `structuredResult` emits both `structuredContent` and an equivalent JSON text block. Existing domain errors with a string `code` retain that code. Use `handleInvalidArguments` only when a package has an established validation envelope that must remain stable.

## 3. Build trusted context

Use `createMcpFnServer({ context })` to derive principals, workspace/tenant IDs, credentials, and request metadata from authenticated transport state. Never copy these values out of tool arguments.

## 4. Replace custom test clients

Use `McpFnTestClient` or an official SDK `Client`. Assert the real initialize and tool-call boundary, not `registry.callTool` or handler functions alone.

## 5. Commit the regression contract

Generate a manifest, review it, add semantic scenarios, and run official conformance for the deployed Streamable HTTP endpoint. Put manifest diff and scenarios in required CI.

## 6. Add HTTP authorization deliberately

Wrap the Web Standard handler with `@mcpfn/auth` when the endpoint is protected. Supply an SDK-compatible token verifier, resource identifier, authorization-server URLs, and required scopes. Do not move outbound provider OAuth flows out of `@superfunctions/oauth-*`; MCP resource-server verification and provider account linking are separate boundaries.

## 7. Declare host requirements

Set `clientRequirements` for roots, sampling, or elicitation used by handlers. Add extension declarations for MCP Apps, then check the manifest against the intended host profile in CI. This turns a host capability mismatch into a pre-release failure instead of a runtime surprise.

## Existing Superfunctions migrations

- LangFn retains its `MCPServer`, `MCPClient`, `StdioMCPTransport`, and `SSEMCPTransport` names at the compatibility edge, but all protocol lifecycle now uses the official SDK. The legacy SSE class name now means Streamable HTTP.
- MemoryFn's `MemoryMCP` exposes the same two tool names with validated inputs and structured results through McpFn.
- ProbeFn shares its existing Zod schemas and exact `ProbefnEnvelope` results with McpFn. Its stdio path is official SDK stdio; its optional TCP compatibility transport implements only stream framing and delegates all JSON-RPC/MCP behavior to the SDK server.

Run `npm run gate:mcpfn-release` after any of these consumers or the shared runtime changes.

The retained LangFn class names are source-level migration aids, not a promise that the removed hand-written transport methods remain available. Consumers that called transport `.request()` or server `.handle()` directly must move to `MCPClient.callTool()` or an official SDK client connection.
