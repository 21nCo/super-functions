---
title: Local FS adapter
description: createLocalStorage — disk-backed storage for development, demos, and single-instance deployments.
---

# Local FS adapter

```ts
import { createLocalStorage } from "@superfunctions/storage";

const storage = createLocalStorage({
  rootDir: "./.filefn-storage",
});
```

## What you get

- Multipart support (parts written to a per-session staging directory, assembled on `complete`).
- `put`, `get`, `delete`.
- No `getSignedUrl` — every download goes through the proxy route.

## When to use it

- Local dev.
- CI / integration tests.
- Single-instance staging.
- Air-gapped self-hosted deployments where you don't want to run a separate object store.

## When not to use it

- Multi-instance production. Two app servers can't share a local directory unless you put a shared volume behind them.
- Edge deployments (Workers, Lambda) — the FS isn't durable.

## Defence in depth

The adapter validates `storageKey` against directory traversal — caller-controlled paths can't escape `rootDir`. filefn's policy registry already prevents callers from injecting paths, but the adapter checks anyway.

## See also

- [Production setup](../examples/production) — the example wires local + a tiny script for prod-style backups.
