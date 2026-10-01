---
title: Semantic search
description: Query scoped vector memories and enforce host authorization on results.
---

`memory.search()` embeds the query and asks the storage adapter for nearest vectors. It fails with `MEMORY_EMBEDDER_REQUIRED` when no embedder is configured; there is no lexical fallback.

```ts
const result = await memory.search({
  tenantId: scope.tenantId,
  containerTags: scope.containerTags,
  q: "interface theme preference",
  limit: 10,
  threshold: 0.7,
});

for (const entry of result.results) {
  // Check current application permissions and deletion state before display.
  console.log(entry.content);
}
```

The PostgreSQL adapter filters to the explicit tenant, all supplied tags, active rows, and latest revisions. `filters` perform exact JSONB metadata containment. `threshold` is a cosine similarity floor, and the adapter orders by vector distance. The returned metadata reports `totalFound` and `returned` for that storage query; it is not a count of all tenant memories.

The input type still advertises `rerank`, relationship traversal, hybrid ranking, token limits, and `onlyLatest`. The current `search()` pipeline does not implement those options. Do not rely on them until code and tests establish their behavior. The host must intersect every result with its current permissions and authoritative deletion state.
