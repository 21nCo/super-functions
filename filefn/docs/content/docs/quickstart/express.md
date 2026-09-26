---
title: Express Quickstart
description: Mount @filefn/server on Express by adapting Node's IncomingMessage to a Fetch Request.
---

# Express

Express ships Node's classic `IncomingMessage` / `ServerResponse` instead of a Fetch `Request` / `Response`. filefn's router takes a Fetch `Request`, so the integration is a small bridge handler.

## Install

```bash
npm install express
npm install @filefn/server @superfunctions/storage-local @superfunctions/db
```

## Streaming bridge (Node 20+)

Create `filefn-express.ts` in the same directory as your server. It accepts FileFn’s nullable router result, preserves binary responses, and streams uploads without a buffered 10 MB parser limit.

```ts
import type { RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

type FileFnRouter = { handle(request: Request): Promise<Response | null> };

export function fileFnHandler(router: FileFnRouter): RequestHandler {
  return (req, res, next) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.once("aborted", abort);
    res.once("close", abort);
    void (async () => {
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
      }
      // Express strips /filefn from req.url while this mounted handler runs.
      const url = new URL(req.url, `${req.protocol}://${req.get("host")}`);
      const init: RequestInit & { duplex?: "half" } = {
        method: req.method, headers, signal: controller.signal,
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
        init.duplex = "half";
      }
      const response = await router.handle(new Request(url, init));
      if (!response) { res.status(404).end(); return; }
      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") res.setHeader(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      if (req.method === "HEAD" || !response.body) {
        await response.body?.cancel();
        res.end();
      } else {
        await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), res);
      }
    })().catch(next).finally(() => {
      req.off("aborted", abort);
      res.off("close", abort);
    });
  };
}
```

## Server

```ts
import express from "express";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";
import { fileFnHandler } from "./filefn-express";

const fileFn = createFileFn({
  database: memoryAdapter({ debug: false }),
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

// Mount before body-consuming middleware: the bridge streams upload bytes.
app.use("/filefn", fileFnHandler(fileFn.router));

app.listen(3001);
```

The bridge streams downloads with backpressure and preserves their bytes and headers. Unknown routes return 404. Keep JSON/raw body parsers off this mount; FileFn’s upload policy still controls accepted file size. The memory database is disposable and loses metadata on restart. Use your host’s persistent adapter, authentication, and policy configuration for production.

## When to use Express vs. Hono

If you're starting fresh, use [Hono](./hono): it ships native `Request`/`Response` and removes the bridge above. If you have an existing Express app, the snippet above is the canonical way to mount filefn without rewriting your stack.

## Next steps

- [Core Concepts › Architecture](../core-concepts/architecture)
- [Frameworks › Express](../frameworks/express) — connecting filefn to Express middleware (auth, CORS, multer-style request limits).
