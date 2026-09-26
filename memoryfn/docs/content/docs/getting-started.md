---
title: Getting started
description: Add, update, and forget scoped memories with the TypeScript package.
---

The source package is `memoryfn/typescript`, published as `@memoryfn/core`. This dev contract is not yet represented by the same-version registry package. Build or pack the checked-out source when evaluating it; do not assume `npm install @memoryfn/core@0.0.3` reproduces these pages.

## Use an explicit ephemeral store

```ts
import { memoryfn } from "@memoryfn/core";

const memory = memoryfn({ storage: { kind: "memory" } });
const scope = { tenantId: "workspace-1", containerTags: ["user:alice"] };

try {
  const { memories } = await memory.add({ ...scope, content: "Prefers dark mode" });
  const saved = memories[0];
  if (saved) {
    await memory.update({
      ...scope,
      id: saved.id,
      expectedRevision: saved.revision ?? 1,
      content: "Prefers a dark theme",
    });
    await memory.forget({ ...scope, id: saved.id });
  }
} finally {
  await memory.close();
}
```

`kind: "memory"` is process-local and intended for tests or deliberate ephemeral use. `add`, `update`, and `forget` work without an embedder, but `search` rejects with `MEMORY_EMBEDDER_REQUIRED`. A supplied tenant ID and tag array are required at runtime even where legacy TypeScript inputs still mark `tenantId` optional.

Use [PostgreSQL storage](/docs/storage) for durable data and configure an [embedder](/docs/embeddings-and-extraction) for semantic search. Apply the bundled SQL migrations before using the PostgreSQL adapter. The host must authenticate callers and derive scope; request bodies and model-controlled tool arguments cannot choose a tenant.

The [API reference](/docs/reference/api) lists the current entry points and input shapes.
