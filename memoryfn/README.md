# MemoryFn

The TypeScript package `@memoryfn/core` provides scoped memory storage, embedding-based retrieval, revisioned updates and forgetting. This worktree adopts the implementation from next and hardens its storage and lifecycle for hosted consumers.

```ts
import { memoryfn } from '@memoryfn/core';
const memory = memoryfn({ storage: { kind: 'memory' } });
const { memories } = await memory.add({ tenantId: 'workspace-1', containerTags: ['user:alice'], content: 'Prefers dark mode' });
await memory.forget({ tenantId: 'workspace-1', containerTags: ['user:alice'], id: memories[0].id });
await memory.close();
```

Use injected Postgres storage for durable data and configure an embedder for semantic retrieval. The process-local adapter is intended for tests and explicit ephemeral use. SQLite requires a supplied adapter.

Read [TypeScript storage, migrations and lifecycle](typescript/README.md). Application membership, sharing and authoritative deletion state remain the consumer's responsibility. This is an unpublished candidate; the registry version does not identify these local changes. Admin and Python packages have not been adopted into this dev worktree.
