---
title: Examples
description: End-to-end runnable filefn examples — full-stack demo and a production-shaped reference setup.
---

# Examples

The filefn repo ships two reference applications:

| Example | What it demonstrates | Stack |
| --- | --- | --- |
| [full-demo](./full-demo) | Browser uploads, thumbnails, download / delete, smoke tests. | Hono server + SvelteKit client + memory adapter + local FS storage. |
| [production](./production) | Multi-policy server with auth, processing, S3 storage, Postgres rows. | Hono + Drizzle + Postgres + S3 + thumbnails. |

Both live under `filefn/examples/` in the repo and are kept in CI green at all times.

## See also

- [Quickstart](../quickstart) — minimal walkthroughs.
- [Frameworks](../frameworks) — production wiring.
