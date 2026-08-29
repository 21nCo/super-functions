import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

const server = createMcpFnServer({
  info: { name: "mcpfn-stdio-fixture", version: "1.0.0" },
  registry: new McpFnRegistry().register({
    name: "echo",
    description: "Echo an input over stdio.",
    inputSchema: { type: "object" },
    handler: async (input) => structuredResult(input),
  }),
});

await server.serveStdio();
