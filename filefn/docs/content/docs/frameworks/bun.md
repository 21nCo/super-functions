---
title: Bun
description: Native Bun.serve integration — fastest start-up, native multipart streaming, and zero-cold-start production deployments.
---

# Bun

Bun's `Bun.serve(...)` already speaks `Request` / `Response`. filefn drops in:

```ts
import { createFileFn, createNucleusPolicies } from "@filefn/server";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import * as schema from "./schema"; // Generated Drizzle table definitions for this dialect.
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";
import { Database } from "bun:sqlite";

const sqlite = new Database("filefn.db");
sqlite.run("PRAGMA journal_mode = WAL");

const db = drizzleAdapter({ db: drizzle(sqlite, { schema }), dialect: "sqlite" });
const storage = createLocalStorageAdapter({ rootDir: "./.filefn-storage" });

const fileFn = createFileFn({
  database: db, storage,
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

Generate/import the Drizzle table definitions in `./schema` and pass the namespace-imported table registry to `drizzle(..., { schema })`. SQL migrations alone are insufficient: the adapter also requires this runtime table registry. See [schema setup](/docs/adapters/db#schema-and-migrations); include every library sharing the adapter and use the same dialect and namespace.
