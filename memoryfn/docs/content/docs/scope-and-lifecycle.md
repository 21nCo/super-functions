---
title: Scope and lifecycle
description: Tenant and tag constraints, optimistic revisions, updates, and tombstones.
---

Every operation needs a nonempty `tenantId` and an array of nonempty `containerTags`. All supplied tags must match within that tenant; an empty array selects the explicit tenant as a whole. Tags constrain retrieval and storage operations, but they are not an application membership or sharing policy. The host must derive and enforce authorization independently.

`requireScope()` runs in the pipeline and bundled adapters. Model-extracted tags are stored as descriptive `metadata.extractedTags`; they cannot expand the caller's container tags. HTTP and MCP adapters derive the tenant from trusted host scope rather than a request body or tool arguments.

## Update with a revision

```ts
const changed = await memory.update({
  tenantId: scope.tenantId,
  containerTags: scope.containerTags,
  id: saved.id,
  expectedRevision: saved.revision ?? 1,
  content: "Updated memory",
});
```

`update()` checks the current scoped row and performs compare-and-update. With an embedder, it replaces the embedding. A failed re-embedding leaves the previous revision intact. A stale `expectedRevision` fails with `MEMORY_REVISION_CONFLICT`.

`forget({ tenantId, containerTags, id, expectedRevision? })` scrubs content, embedding, and metadata; removes relationships; and retains an immutable-ID tombstone. The bundled PostgreSQL adapter performs scrub and relationship cleanup in one transaction. It can be retried, and an update cannot resurrect the tombstone. `expectedRevision` can protect against forgetting a newer revision.

The application's authoritative record may be forgotten before this derived store is cleaned. Deny retrieval immediately using that authoritative state, retry derived-store cleanup, and apply equivalent tombstone checks to any external indexes or replicas. See the [storage guide](/docs/storage) for adapter requirements.
