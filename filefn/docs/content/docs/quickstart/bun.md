---
title: Bun Quickstart
description: Run @filefn/server on Bun.serve with native Fetch Request / Response.
---

# Bun

filefn runs on Bun without modification. `Bun.serve`'s `fetch` handler is a Fetch `Request → Response`, which is exactly what `fileFn.router.handle` accepts.

## Install

```bash
bun add @filefn/server @superfunctions/storage @superfunctions/db
```

## Server

```ts
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage";

const fileFn = createFileFn({
  db: memoryAdapter({ debug: false }),
  storage: createLocalStorageAdapter({ rootDir: "./.filefn-storage" }),
  policies: [
    { name: "public-image", contentTypes: ["image/*"], maxSizeBytes: 10 * 1024 * 1024, visibility: "public" },
  ],
  auth: { required: false },
});

Bun.serve({
  port: 3001,
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/filefn")) {
      return new Response("Not Found", { status: 404 });
    }

    const stripped = url.pathname.replace(/^\/filefn/, "") || "/";
    const forwarded = new Request(url.origin + stripped + url.search, request);

    const response = await fileFn.router.handle(forwarded);
    return response ?? new Response("Not Found", { status: 404 });
  },
});
```

## Why Bun is the fastest path

- Native multipart upload streaming through `Bun.file`
- No `Buffer ↔ Uint8Array` reshaping
- `bun --hot` for stateful dev with the in-memory adapter

## Next steps

- [Frameworks › Bun](../frameworks/bun) — production patterns (graceful shutdown, structured logging).
- [Adapters › Storage](../adapters/storage) — moving off the local filesystem.
