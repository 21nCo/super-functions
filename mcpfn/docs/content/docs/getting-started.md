---
title: Getting started
description: Install McpFn, declare a validated tool, and run a server.
---

## Install

```sh
npm install @mcpfn/core
```

Add `@mcpfn/client` to connect from an application and `@mcpfn/cli` plus `@mcpfn/testing` for regression checks. McpFn packages require Node.js 18.18 or newer. The HTTP runtime also supports Web Standard handlers on edge runtimes; see [deployment](/docs/deployment).

## Declare a tool

```ts
import {
  McpFnRegistry,
  defineMcpFnServer,
  structuredResult,
} from "@mcpfn/core";

const registry = new McpFnRegistry().register({
  name: "greet",
  description: "Greet one person by name.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { greeting: { type: "string" } },
    required: ["greeting"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ name }) =>
    structuredResult({ greeting: `Hello, ${String(name)}!` }),
});

const declaration = defineMcpFnServer({
  info: { name: "example", version: "1.0.0" },
  registry,
  transports: ["stdio", "streamable-http"],
});

export default declaration;
```

Save the declaration as `server.ts`. Put the live transport in a separate `stdio.ts` entrypoint:

```ts
import declaration from "./server.js";

const server = declaration.createServer();
await server.serveStdio();
```

Install a TypeScript runner and generate the manifest from the declaration module, then start the transport:

```sh
npm install --save-dev @mcpfn/cli tsx
npx mcpfn manifest server.ts --output manifest.json
npx tsx stdio.ts
```

The declaration is safe to import from manifest and test tooling. Create a separate server instance for each live connection. A tool handler receives schema-valid arguments. A declared output schema also validates its structured result before it reaches the client.

## Add the regression contract

Commit a reviewed manifest and semantic scenarios with the application. Run the candidate through `mcpfn diff` and the scenarios through `mcpfn test` in CI. The [testing guide](/docs/testing) explains each layer and its limits.

For a complete runnable example, see the [calculator server](https://github.com/21nCo/super-functions/blob/dev/mcpfn/examples/calculator-server.ts), [stdio entrypoint](https://github.com/21nCo/super-functions/blob/dev/mcpfn/examples/calculator-stdio-server.ts), [HTTP entrypoint](https://github.com/21nCo/super-functions/blob/dev/mcpfn/examples/calculator-http-server.ts), and [client](https://github.com/21nCo/super-functions/blob/dev/mcpfn/examples/calculator-client.ts).
