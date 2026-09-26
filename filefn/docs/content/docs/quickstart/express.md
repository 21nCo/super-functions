---
title: Express Quickstart
description: Mount @filefn/server on Express by adapting Node's IncomingMessage to a Fetch Request.
---

# Express

Express ships Node's classic `IncomingMessage` / `ServerResponse` instead of a Fetch `Request` / `Response`. filefn's router takes a Fetch `Request`, so the integration is a small bridge handler.

## Install

```bash
npm install express @superfunctions/http-express
npm install @filefn/server @superfunctions/storage-local @superfunctions/db
```

## Server

```ts
import express from "express";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";
import { toExpress } from "@superfunctions/http-express";

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
  auth: { required: false },
});

const app = express();

// Raw parsing preserves chunk bytes; keep this limit above the configured chunk size.
app.use("/filefn", express.raw({ type: "*/*", limit: "10mb" }), toExpress(fileFn.router));

app.listen(3001);
```

For large downloads, replace the buffered response handling with a streaming bridge that pipes the `Response.body` Web stream into `res` (Node 18+ supports `Readable.fromWeb(response.body)`).

## When to use Express vs. Hono

If you're starting fresh, use [Hono](./hono): it ships native `Request`/`Response` and removes the bridge above. If you have an existing Express app, the snippet above is the canonical way to mount filefn without rewriting your stack.

## Next steps

- [Core Concepts › Architecture](../core-concepts/architecture)
- [Frameworks › Express](../frameworks/express) — connecting filefn to Express middleware (auth, CORS, multer-style request limits).
