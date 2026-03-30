# @searchfn/server

`@searchfn/server` exposes SearchFn over the shared `@superfunctions/http` router abstraction. It does not implement indexing itself; instead, it wraps any `SearchAdapter` with validated HTTP endpoints.

## Installation

```bash
npm install @searchfn/server @searchfn/adapter-memory @superfunctions/http
```

Use a concrete adapter such as `@searchfn/adapter-memory`, `@searchfn/adapter-indexeddb`, `@searchfn/adapter-postgres`, `@searchfn/adapter-elasticsearch`, or `@searchfn/adapter-meilisearch`.

## Quick Start

```ts
import { createSearchFnServer } from "@searchfn/server";
import { MemoryAdapter } from "@searchfn/adapter-memory";

const adapter = new MemoryAdapter();
await adapter.initialize?.({
  resources: [{ name: "docs", searchFields: ["title", "body"] }],
});

const searchfn = await createSearchFnServer({
  adapter,
  basePath: "/searchfn",
});

const response = await searchfn.router.handle(
  new Request("http://localhost/searchfn/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resource: "docs", query: "hybrid" }),
  }),
);
```

## Endpoints

- `GET /searchfn/status`
- `POST /searchfn/index`
- `POST /searchfn/search`
- `POST /searchfn/search-all`
- `POST /searchfn/remove`
- `POST /searchfn/clear`

All JSON responses use the canonical envelope shape:

```json
{
  "ok": true,
  "result": {}
}
```

or

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Search query must not be empty"
  }
}
```

## Configuration

```ts
type SearchFnServerConfig<TContext> = {
  adapter: SearchAdapter;
  basePath?: string;
  limits?: Partial<ServerLimits>;
  authorize?: (
    ctx: TContext,
    action: "status" | "index" | "search" | "searchAll" | "remove" | "clear",
    payload: unknown,
  ) => Promise<boolean> | boolean;
  logger?: SearchFnLogger;
};
```

### Notes

- `authorize(...)` runs before each handler and receives the parsed JSON payload when applicable.
- `limits` controls payload size, query length, search fan-out, and indexing batch caps.
- `close()` delegates to `adapter.dispose()` when the adapter implements it.
