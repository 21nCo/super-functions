# @searchfn/client

`@searchfn/client` is the thin client layer for SearchFn. It wraps a `SearchAdapter` with runtime validation, default handling, deterministic `searchAll` fallback behavior, and an in-memory helper for lightweight local search.

## Installation

```bash
npm install @searchfn/client
```

## Quick Start

```ts
import { createSearchClient } from "@searchfn/client";
import { MemoryAdapter } from "@searchfn/adapter-memory";

const client = createSearchClient({
  adapter: new MemoryAdapter(),
  defaults: { limit: 10, prefix: true },
});

await client.index({
  resource: "docs",
  documents: [
    {
      id: "doc-1",
      fields: {
        title: "Hybrid search",
        body: "Adapter-backed search from the client package",
      },
    },
  ],
});

const ids = await client.search({ resource: "docs", query: "hybrid" });
console.log(ids);
```

## API

### `createSearchClient({ adapter, defaults })`

Creates a validated SearchFn client on top of any `SearchAdapter`.

```ts
const client = createSearchClient({
  adapter,
  defaults: {
    limit: 25,
    fuzzy: true,
    prefix: true,
    fieldBoosts: { title: 2 },
  },
});
```

### Indexing

```ts
await client.index({
  resource: "docs",
  documents: [
    {
      id: "doc-1",
      fields: {
        title: "Getting Started",
        body: "Full-text search guide",
      },
    },
  ],
});
```

### Searching

```ts
const ids = await client.search({
  resource: "docs",
  query: "getting started",
  limit: 10,
  fields: ["title"],
});
```

### Searching Across Resources

```ts
const results = await client.searchAll({
  query: "getting started",
  resources: ["docs", "notes"],
  limit: 10,
  limitPerResource: 5,
});
```

### Removing

```ts
await client.remove({ resource: "docs", ids: ["doc-1"] });
```

## InMemorySearchFn

For data that is already loaded in memory, use `InMemorySearchFn`.

```ts
import { InMemorySearchFn } from "@searchfn/client";

const search = new InMemorySearchFn({
  fields: ["title", "tags"],
});

search.add({
  id: "link-1",
  fields: { title: "Home Page", tags: "navigation main" },
  store: { url: "/", visits: 42 },
});

const results = search.searchDetailed("home", { includeStored: true });
```

Available synchronous helpers:

- `add(...)`
- `search(...)`
- `searchDetailed(...)`
- `remove(...)`
- `getDocument(...)`
- `clear()`
- `exportSnapshot()`
- `importSnapshot(...)`

## Exports

- `@searchfn/client`
- `@searchfn/client/in-memory-search`
- `@searchfn/client/constructors`
