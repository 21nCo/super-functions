# McpFn

McpFn is the Superfunctions layer for building and keeping Model Context Protocol servers regression-free. It uses the official MCP SDK for protocol and transport behavior, then adds validated tools, resources, prompts, task execution, client-mediated features, OAuth resource-server security, MCP Apps contracts, deterministic manifests, compatibility diffs, semantic scenarios, and a safe DataFn adapter.

## Packages

| Package | Purpose |
| --- | --- |
| `@mcpfn/core` | Official-SDK runtime, tools/resources/prompts/tasks, client-mediated features, MCP Apps contracts, manifests, and compatibility diffing |
| `@mcpfn/auth` | RFC 9728 protected-resource metadata, Bearer verification, scope/audience checks, and enterprise-managed authorization discovery helpers |
| `@mcpfn/testing` | Protocol client, auth regression matrices, mock OAuth/PKCE server, optional Playwright fixtures, host profiles, scenarios, and conformance orchestration |
| `@mcpfn/datafn` | Deny-by-default generation of bounded MCP tools from a DataFn server executor |
| `@mcpfn/cli` | `manifest`, `validate`, `diff`, `test`, and `conformance` commands with stable CI exit codes |

McpFn stays below product-level inspector and evaluation UIs. It owns server contracts and release evidence; MCPJam Inspector and other hosts remain useful interactive clients rather than runtime dependencies.

## Quick start

```ts
import {
  McpFnRegistry,
  createMcpFnServer,
  structuredResult,
} from "@mcpfn/core";

const registry = new McpFnRegistry().register({
  name: "skill_get",
  description: "Resolve one published skill by slug.",
  inputSchema: {
    type: "object",
    properties: { slug: { type: "string", minLength: 1 } },
    required: ["slug"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { skill: { type: "object" } },
    required: ["skill"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ slug }) =>
    structuredResult({ skill: await resolvePublishedSkill(String(slug)) }),
});

const server = createMcpFnServer({
  info: { name: "skillplane", version: "1.0.0" },
  registry,
  transports: ["stdio", "streamable-http"],
});

await server.serveStdio();
```

The handler receives only schema-valid arguments. If an output schema is declared, McpFn also validates `structuredContent` before returning it. Domain errors with a string `code` retain that code in the MCP error result.

## Regression workflow

Commit a manifest baseline and semantic scenarios with the MCP server:

```sh
mcpfn manifest ./src/mcp/server.ts --output ./mcpfn.manifest.json
mcpfn validate ./mcpfn.manifest.json
mcpfn diff ./mcpfn.manifest.json ./candidate.manifest.json --fail-on-behavioral
mcpfn test ./src/mcp/server.ts ./tests/mcp.scenarios.ts --output ./mcpfn-report.json
mcpfn conformance http://127.0.0.1:3000/mcp --suite active
```

The manifest catches tool, resource, template, prompt, task, extension, client-requirement, protocol-version, and transport changes. Scenarios catch business behavior. Host profiles expose feature mismatches. The official conformance runner catches wire-protocol behavior. None of those layers substitutes for the others.

The conformance subcommand pins the reviewed official runner version and requires Node.js 22 or newer. Other McpFn commands support Node.js 18.18 or newer.

Run `npm run gate:mcpfn-release` from this repository for the complete package, example, migration, and packability gate.

## Authorization and MCP Apps

Wrap `server.createWebStandardHandler()` with `createOAuthResourceServerHandler()` from `@mcpfn/auth`. The wrapper serves protected-resource metadata and injects verified SDK `authInfo`; authorization-code, PKCE, DCR, token exchange, and issuance remain authorization-server responsibilities. Existing `@superfunctions/oauth-*` packages continue to own outbound provider connections, so the two concerns do not duplicate one another.

Use `@mcpfn/testing/auth` to run the common missing, invalid, valid, insufficient-scope, expired, wrong-resource, and revoked credential matrix. Use `@mcpfn/testing/playwright` for a real authorization-code + PKCE browser flow, refresh rotation, revocation, callback capture, and extensible Client ID Metadata fixtures. An application such as Skillplane supplies only its API-key/token lifecycle adapter, authorization endpoint, login setup, and product-specific access assertions.

Use `createMcpAppResource()` and `mcpAppToolMetadata()` for `ui://` HTML resources. McpFn validates the MCP App MIME type, CSP metadata, visibility, and tool-to-resource links. It does not implement a browser iframe host.

## DataFn boundary

`@mcpfn/datafn` is useful when a domain operation really is a bounded projection of DataFn query/mutation semantics. A resource must be explicitly named, returned fields are fixed, filter/sort fields are allowlisted, and writes require explicit fields plus a caller-supplied `mutationId`. Authentication, namespace, actor, and `clientId` values come from trusted server context.

Do not auto-publish an entire DataFn schema. Skillplane-style operations such as version resolution, access grants, audit workflows, or asset delivery should remain explicit domain tools even if they call DataFn internally.

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Testing and CI](./TESTING.md)
- [Migration guide](./MIGRATION.md)
- [Core API](./core/README.md)
- [OAuth resource server](./auth/README.md)
- [DataFn adapter](./datafn/README.md)
- [Testing package](./testing/README.md)
- [CLI](./cli/README.md)
