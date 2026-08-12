---
title: Hono Quickstart
description: Mount @filefn/server on a Hono app on Node, Bun, or Cloudflare Workers in a few lines.
---

# Hono

Hono is the canonical filefn integration: native `Request`/`Response`, runs on Node, Bun, Deno, and Workers, and the kernel router slots in as a single catch-all handler.

## Install

```bash
npm install hono @hono/node-server
npm install @filefn/server @superfunctions/storage @superfunctions/db
```

For Bun or Workers, drop `@hono/node-server` and use the runtime's native `serve` / `fetch`.

## Server

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage";

const fileFn = createFileFn({
  db: memoryAdapter({ debug: false }),
  storage: createLocalStorageAdapter({ rootDir: "./.filefn-storage" }),
  policies: [
    {
      name: "public-image",
      contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      maxSizeBytes: 10 * 1024 * 1024,
      visibility: "public",
    },
  ],
  auth: {
    required: true,
    resolveSession: async (request) => {
      const userId = request.headers.get("x-demo-user");
      if (!userId) return null;
      return { principalId: userId, tenantId: "default" };
    },
  },
});

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Content-Type", "Authorization", "x-request-id", "x-upload-session-token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.all("/filefn/*", async (c) => {
  const url = new URL(c.req.raw.url);
  const stripped = url.pathname.replace(/^\/filefn/, "") || "/";
  const newReq = new Request(url.origin + stripped + url.search, {
    method: c.req.method,
    headers: c.req.header() as any,
    body: c.req.raw.body,
    duplex: "half",
  } as any);

  const response = await fileFn.router.handle(newReq);
  return response ?? c.notFound();
});

serve({ fetch: app.fetch, port: 3001 });
```

That's it. Multipart uploads, signed URLs, share-link routes (when enabled), processing, and grants are all live under `/filefn/*`.

## Bun

The exact same code runs on Bun. Replace the `serve(...)` call with:

```ts
Bun.serve({
  port: 3001,
  fetch: app.fetch,
});
```

## Cloudflare Workers

Drop `@hono/node-server` and `createLocalStorageAdapter`. Use `createR2StorageAdapter` (or any other adapter that runs on Workers) and Wrangler's standard pattern:

```ts
export default {
  fetch: app.fetch,
};
```

`@filefn/server` does not depend on `node:` modules in its hot path — only the storage / db adapters can have runtime constraints.

## Client

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "/filefn",
  getAuthHeaders: async () => ({ "x-demo-user": "demo-user" }),
});
```

## Next steps

- [Core Concepts › Architecture](../core-concepts/architecture) — what the router actually does.
- [Frameworks › Hono](../frameworks/hono) — production-grade integration with rate limiting, CSRF, and Hono middleware.
