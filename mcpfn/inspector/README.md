# `@mcpfn/inspector`

`@mcpfn/inspector` is a headless MCP inspection engine. It connects through
`@mcpfn/client`, inventories the negotiated server surface, records redacted
lifecycle diagnostics, executes tools/resources/prompts, and exports sanitized
regression scenarios. CLI and future graphical shells can share it without
forking transport or authorization behavior.

Its version 1 timeline also records logging, progress, task status, resource
updates, list changes, and subscription events. Retention is bounded by event
count and serialized bytes; snapshots expose dropped-event and completeness
metadata instead of silently presenting a partial history as complete.

```ts
import { streamableHttpTarget } from "@mcpfn/client";
import { McpFnInspector } from "@mcpfn/inspector";

const inspector = await McpFnInspector.create({
  target: streamableHttpTarget("https://example.com/mcp"),
}).connect();
console.log(await inspector.snapshot());

const operation = {
  kind: "tools.call" as const,
  name: "status",
  arguments: {},
};
const result = await inspector.run(operation);
const scenario = inspector.exportScenario("status remains healthy", operation, result);
// `scenario` is a top-level @mcpfn/testing McpFnScenario accepted by
// runScenarios(), loadScenarios(), and `mcpfn test`.

await inspector.close();
```

Snapshots and exported scenarios are redacted. The inspector never persists
OAuth credentials. Observed tool results are narrowed to the shared runner's
stable `isError` and `structuredContent` expectations rather than serializing
the full SDK response as an incompatible expectation object.
