---
title: Frameworks
description: Production wiring for filefn behind every major web framework — Hono, Express, Bun, SvelteKit, Next.js, FastAPI, Flask.
---

# Frameworks

filefn exposes a single `router.handle(request: Request) → Response | null` per kernel. Every framework integration is a thin adapter that converts the framework's request/response into `Request`/`Response` and dispatches.

These pages are production-grade — they include CSRF, rate limiting, session wiring, and reverse-proxy guidance. The [Quickstart](../quickstart) versions are the minimal "boot it up" walkthroughs.

## Pages in this section

- [Hono (Node / Bun / Workers)](./hono)
- [Express](./express)
- [Bun (native)](./bun)
- [SvelteKit](./sveltekit)
- [Next.js](./nextjs)
- [FastAPI (Python)](./fastapi)
- [Flask (Python)](./flask)
