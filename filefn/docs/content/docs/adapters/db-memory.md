---
title: In-memory DB adapter
description: Disposable database state for local examples and tests.
---

# In-memory database

```ts
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
const db = memoryAdapter();
```

Pass this adapter to `createFileFn({ database: db, storage, ... })`. State lasts only as long as the adapter instance. Recreating it or restarting the process loses file metadata, upload sessions, grants, and shares even if the storage adapter still contains bytes. Use a persistent SQL database for durable deployments. See [Drizzle](./db-drizzle).
