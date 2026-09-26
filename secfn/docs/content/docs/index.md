---
title: SecFn
description: Encrypted secrets, scoped retrieval, scanning, and security services.
---

SecFn's implemented packages provide pure encryption and scanner contracts, an adapter-backed server with admin and runtime routes, and a read-only runtime client. The server also handles RBAC, service tokens, rate limiting, and durable audit events. Start with [getting started](/docs/getting-started), then follow the [server](/docs/server), [scope](/docs/scope-and-permissions), and [runtime](/docs/runtime) guides.

The older `secfn/SPEC.md` is a V0 proposal with paths and features that do not match this checkout. These pages follow `@secfn/core`, `@secfn/server`, and `@secfn/runtime` on `origin/dev`. Apply the current schema and migration requirements before using a database, and keep secret material in trusted processes.
