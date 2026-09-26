---
title: Server and storage
description: Persist canonical source, revisions, and sidecars atomically.
---

# Server and storage

`@mdfn/server` provides document CRUD, immutable versions, restore, editorial workflows, collaboration-update storage, authorization hooks, and a Web Standard router under `/api/mdfn` by default. Every operation is tenant or owner scoped and passes through a host authorization callback.

Durable mode is the default. It requires a database adapter with transactions and relational constraints; the server wraps the adapter with its schema. Create, update, restore, and editorial writes validate Markdown and the complete sidecar atomically. `Idempotency-Key` can guard writes. The explicit ephemeral mode is only for memory-backed tests and examples.

Use [@mdfn/client](/docs/reference/client) for typed fetch calls. The [server guide](/docs/reference/server) describes route behavior and storage boundaries.
