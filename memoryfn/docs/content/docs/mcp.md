---
title: MCP adapter
description: Expose scoped MemoryFn tools through a trusted stdio host.
---

`MemoryMCP` from `@memoryfn/core/mcp` wraps a MemoryFn instance with two McpFn tools over stdio: `add_memory` and `search_memories`. Construct it for a **trusted scope**. Tool arguments may add tag constraints but cannot choose the tenant.

```ts
import { MemoryMCP } from "@memoryfn/core/mcp";

const adapter = new MemoryMCP(memory, {
  tenantId: authorizedTenantId,
  containerTags: authorizedTags,
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await adapter.close();
  } finally {
    await memory.close();
  }
}
function requestShutdown() {
  void shutdown().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, requestShutdown);
}
process.stdin.once("end", requestShutdown);
try {
  await adapter.start(); // Resolves when connected; the transport keeps listening.
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await shutdown();
}
```

`add_memory` accepts required `content` and optional `tags`, and returns a structured summary of created, updated, and deduplicated counts. `search_memories` accepts required `query`, optional `limit` (1–100; default 5), and optional tags. It returns only result content plus count metadata. The adapter also exposes `manifest()` and `connect(transport)` for host integration.

The scope is captured at construction. Instantiate per authorized scope and make the host revoke access when that authority ends; the adapter does not infer a later permission change. Semantic search still requires an embedder. The [MCP source](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/mcp/server.ts) defines the tool schemas and output shapes.
