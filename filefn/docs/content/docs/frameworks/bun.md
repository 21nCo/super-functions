---
title: Bun
description: Native Bun.serve integration — fastest start-up, native multipart streaming, and zero-cold-start production deployments.
---

# Bun

Bun's `Bun.serve(...)` already speaks `Request` / `Response`. filefn drops in:

```ts
import { createFileFn, createNucleusPolicies } from "@filefn/server";
import { createSQLiteAdapter } from "@superfunctions/db-sqlite";
import { createLocalStorage } from "@superfunctions/storage";
import { Database } from "bun:sqlite";

const sqlite = new Database("filefn.db");
sqlite.run("PRAGMA journal_mode = WAL");

const db = createSQLiteAdapter({ db: sqlite });
const storage = createLocalStorage({ rootDir: "./.filefn-storage" });

const fileFn = createFileFn({
  db, storage,
  policies: createNucleusPolicies(),
});

Bun.serve({
  port: 3000,
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith("/filefn/")) {
      const response = await fileFn.router.handle(request);
      if (response) return response;
    }
    return new Response("not found", { status: 404 });
  },
});
```

## Why Bun?

- Native multipart streaming — proxy `PUT` routes run with zero allocations beyond the body buffer.
- Native crypto — checksums and signatures use the runtime's primitives, not WASM.
- Faster cold start — useful in autoscaling fleets.

## When to use it

- Edge / serverless workloads where startup latency matters.
- Memory-constrained deployments — Bun's footprint is smaller than Node for the same surface.
- New projects without legacy Node dependencies.

## When not to use it

- Stacks heavily dependent on Node-only native modules (`canvas`, certain database drivers). Bun has improved compatibility but isn't 100%.

## CORS

Bun.serve doesn't ship CORS — handle it in the kernel by wrapping the response, or front it with a Hono / Elysia layer:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("/filefn/*", cors({ origin: process.env.APP_ORIGIN! }));
app.all("/filefn/*", async (c) => (await fileFn.router.handle(c.req.raw)) ?? c.notFound());

Bun.serve({ port: 3000, fetch: app.fetch });
```

## See also

- [Quickstart › Bun](../quickstart/bun) — minimal version.
