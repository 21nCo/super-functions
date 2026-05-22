---
title: Express Quickstart
description: Mount @filefn/server on Express by adapting Node's IncomingMessage to a Fetch Request.
---

# Express

Express ships Node's classic `IncomingMessage` / `ServerResponse` instead of a Fetch `Request` / `Response`. filefn's router takes a Fetch `Request`, so the integration is a small bridge handler.

## Install

```bash
npm install express
npm install @filefn/server @superfunctions/storage @superfunctions/db
```

## Server

```ts
import express from "express";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage";
import type { IncomingMessage, ServerResponse } from "node:http";

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

app.use("/filefn", async (req: IncomingMessage, res: ServerResponse) => {
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : (req as unknown as ReadableStream<Uint8Array>);

  const fetchRequest = new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: "half",
  } as any);

  const response = await fileFn.router.handle(fetchRequest);
  if (!response) {
    res.statusCode = 404;
    res.end();
    return;
  }

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
});

app.listen(3001);
```

For large downloads, replace the buffered response handling with a streaming bridge that pipes the `Response.body` Web stream into `res` (Node 18+ supports `Readable.fromWeb(response.body)`).

## When to use Express vs. Hono

If you're starting fresh, use [Hono](./hono): it ships native `Request`/`Response` and removes the bridge above. If you have an existing Express app, the snippet above is the canonical way to mount filefn without rewriting your stack.

## Next steps

- [Core Concepts › Architecture](../core-concepts/architecture)
- [Frameworks › Express](../frameworks/express) — connecting filefn to Express middleware (auth, CORS, multer-style request limits).
