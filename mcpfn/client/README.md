# `@mcpfn/client`

Production MCP client and headless session engine for Node.js 18.18 or newer.
It delegates protocol lifecycle and transports to the official MCP SDK, while
adding target descriptors, idempotent connection lifecycle, complete inventory
pagination, typed capability facades, explicit reconnect/cancellation, and
secret-redacted phase diagnostics.

Pass `handlers.roots`, `handlers.sampling`, or `handlers.elicitation` to infer
and advertise the corresponding client capabilities without raw SDK setup.
`onEvent()` and the `events` option observe redacted logging, progress, task
status, resource/list changes, subscriptions, and client-mediated requests.
The lower-level `configure` hook remains available for extensions.

```ts
import { createMcpFnClient, streamableHttpTarget } from "@mcpfn/client";

const client = createMcpFnClient({
  target: streamableHttpTarget("https://api.example.com/mcp"),
  diagnostics: (event) => audit.safe(event),
});

await client.connect();
const tools = await client.tools.listAll();
const result = await client.tools.call("orders_list", { limit: 20 });
await client.close();
```

`stdioTarget()` is Node-only. `streamableHttpTarget()` uses Web Standard
requests through the official SDK. Authorization is supplied through an
official `OAuthClientProvider`, including the McpFn provider from
`@mcpfn/auth`. When an interactive flow is required, `connect()` reports
`MCPFN_AUTHORIZATION_REQUIRED`; pass the callback code to
`completeAuthorization({ code, state })` and the client validates callback
correlation, completes the SDK exchange, and reconnects without replaying a
domain operation.

McpFn retries only connection establishment when explicitly configured. It
never implicitly replays tool calls, writes, or other capability operations.
