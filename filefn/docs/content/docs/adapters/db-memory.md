---
title: Memory DB adapter
description: createMemoryAdapter — an in-process, in-RAM adapter for tests, CI, and ephemeral demos.
---

# Memory DB adapter

```ts
import { createMemoryAdapter } from "@superfunctions/db-memory";

const db = createMemoryAdapter();
```

## What it stores

Everything in RAM. No persistence between processes.

## When to use it

- Unit tests / integration tests.
- CI pipelines.
- Local demos where you don't want to spin up Postgres.
- Documentation snippets.

## When not to use it

- Production. Anything restart-recoverable needs persistence.

## Notes

The memory adapter implements `transaction(...)` as a synchronous no-op (everything in memory is atomic anyway). It supports the full `Adapter` surface used by filefn.

## See also

- [Examples › Full demo](../examples/full-demo) — uses the memory adapter.
