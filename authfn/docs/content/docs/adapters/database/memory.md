---
title: Memory adapter
description: In-memory database — for tests and local development. Don't use it in production.
---

# Memory adapter

`memoryAdapter` is an in-memory implementation of the `@superfunctions/db` adapter contract. It exists for one purpose: **tests and local development without infrastructure**.

```ts
import { memoryAdapter } from '@superfunctions/db/adapters/memory';

createAuthFn({
  database: memoryAdapter({ debug: false }),
  // ...
});
```

## What it does

- Stores all rows in a JavaScript `Map` per model.
- Implements every adapter operation correctly: `create`, `findOne`, `findMany`, `update`, `delete`, `count`, transactional helpers.
- Resets between processes — there's no persistence.

## What it doesn't do

- Doesn't span isolates — every Cloudflare Workers / Lambda / Vercel Edge execution sees its own copy.
- Doesn't survive restarts.
- Doesn't enforce SQL-level constraints (those are at the kernel layer).

## When to use it

- **Unit tests** — fast, deterministic, hermetic.
- **Quickstarts and local development** — zero setup.
- **CI smoke tests** — the bundled examples run against memory by default.

## When *not* to use it

- **Anywhere shared with other processes / replicas / regions.** Use a real adapter instead.
- **Production.** It will silently lose data if the process restarts. There is no warning.

## Configuration

```ts
memoryAdapter({
  debug: true,           // logs every operation
});
```

That's it.

## Related

- [Quickstart](../quickstart) — every quickstart starts with `memoryAdapter`.
- [Adapters → Drizzle](./drizzle), [Postgres](./postgres), [SQLite](./sqlite) — production-grade adapters.
