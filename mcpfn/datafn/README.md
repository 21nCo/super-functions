# McpFn DataFn Adapter

`@mcpfn/datafn` turns explicitly approved DataFn operations into stable MCP tools. It is deny-by-default:

- no resource is exposed unless named in `expose`;
- every read uses a fixed output projection;
- filters and sort fields are allowlisted;
- writes require explicit writable fields and a caller-supplied idempotency key;
- principal and namespace context comes from the server, never tool arguments;
- all calls execute through `DatafnExecutor`, preserving DataFn validation, permissions, hooks, authorization, namespace isolation, rate limits, and idempotency.

```ts
import { createMcpFnServer } from "@mcpfn/core";
import { createDatafnMcpRegistry } from "@mcpfn/datafn";

const registry = createDatafnMcpRegistry({
  schema,
  executor: datafnServer.executor,
  context: (mcpContext) => ({
    workspaceId: mcpContext.workspaceId,
    actorId: mcpContext.actorId,
  }),
  clientId: (mcpContext) => `mcp:${mcpContext.credentialId}`,
  expose: {
    skills: {
      fields: ["id", "slug", "name", "updatedAt"],
      list: {
        filterFields: ["slug", "name"],
        sortFields: ["updatedAt", "id"],
        maxLimit: 50,
      },
      get: true,
    },
  },
});

const server = createMcpFnServer({
  info: { name: "skills-data", version: "1.0.0" },
  registry,
  context: async (extra) => authenticateMcpRequest(extra.requestInfo),
  transports: ["stdio", "streamable-http"],
});
```

This adapter is appropriate for bounded data operations. Domain workflows with additional authorization, auditing, asset grants, or version-resolution semantics should remain explicit McpFn tools.

## Exposure reference

- `fields` is the fixed list/get projection and must be non-empty, unique, and allowed by DataFn read policy.
- `list` and `get` default to enabled after the resource itself is explicitly present in `expose`; pass `false` to disable either one.
- `list.filterFields` defaults to `fields`; `sortFields` defaults to `id`; `defaultLimit` defaults to `50`; `maxLimit` defaults to `100`.
- `create`, `update`, and `delete` default off. Create/update require a writable `fields` allowlist. All writes require `mutationId` and use the trusted `clientId` resolver.
- Default names are `datafn_<resource>_<operation>`; `toolPrefix`, per-operation `name`, and descriptions can be overridden.

Adapter construction fails before serving if a resource or field is unknown, unreadable, read-only, or not writable under the resolved DataFn capabilities.
