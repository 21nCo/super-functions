# `@mcpfn/inspector`

`@mcpfn/inspector` is a headless MCP inspection engine. It connects through
`@mcpfn/client`, inventories the negotiated server surface, records redacted
lifecycle diagnostics, executes tools/resources/prompts, and exports sanitized
regression scenarios. CLI and future graphical shells can share it without
forking transport or authorization behavior.

```ts
import { streamableHttpTarget } from "@mcpfn/client";
import { McpFnInspector } from "@mcpfn/inspector";

const inspector = await McpFnInspector.create({
  target: streamableHttpTarget("https://example.com/mcp"),
}).connect();
console.log(await inspector.snapshot());
await inspector.close();
```

Snapshots and exported scenarios are redacted. The inspector never persists
OAuth credentials.
