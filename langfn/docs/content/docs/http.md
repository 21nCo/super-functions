---
title: HTTP routes
description: Mount model and trace endpoints with trusted authentication.
---

`createLangFnRouter(lang, options)` uses `@superfunctions/http` and defaults to a one MiB JSON body limit. The route set includes `GET /health`, `POST /complete`, `POST /chat`, `POST /stream`, `POST /embed`, `GET /traces`, and `POST /feedback`. The host mounts the router and supplies authentication and rate-limit providers appropriate to its deployment.

Trace listing and feedback require an authenticated actor. Their stored and queried scope comes from trusted session metadata, not request-supplied tenant or user values. Custom trace stores serving scoped HTTP access must advertise `supportsScope: true`, apply both tenant and user predicates before pagination, and implement scoped `findOne` for feedback ownership. Historical unowned traces do not appear in HTTP results.

HTTP provider errors omit upstream response bodies and metadata. The built-in `POST /stream` SSE route cancels model work when the request signal aborts; this requires a host bridge that propagates disconnects and streams response chunks. The current `@superfunctions/http-express` adapter buffers responses and does not provide that behavior. See the [source router](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/http/routes.ts) and [release gate](/docs/reference/release-gate) for exact input and scope rules.

## Mount an authenticated Node 20+ server

```sh
npm install langfn express
npm install --save-dev tsx
```

This local single-user example requires `LANGFN_DEMO_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL` in the server environment. Save it as `server.ts` and run `npx tsx server.ts`:

```ts
import express from "express";
import { LangFn } from "langfn";
import { OpenAIChatModel } from "langfn/models";
import { createLangFnRouter } from "langfn/http";
import { langFnHandler } from "./langfn-express";

const token = process.env.LANGFN_DEMO_TOKEN;
if (!token || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  throw new Error("Set the demo token, provider key, and model");
}
const lang = new LangFn({ model: new OpenAIChatModel({
  apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
}) });
const router = createLangFnRouter(lang, {
  auth: {
    validateBearerToken(value) {
      return value === token ? {
        id: "local-session", type: "bearer",
        subject: { actorId: "local-user", actorType: "user", tenantId: "local" },
      } : null;
    },
  },
  maxBodyBytes: 1024 * 1024,
});
const app = express();
// Keep body parsers off this mount; LangFn enforces its JSON limit.
app.use("/api/langfn", langFnHandler(router));
app.listen(3020);
```

```sh
curl http://localhost:3020/api/langfn/complete \
  -H "Authorization: Bearer $LANGFN_DEMO_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Describe optimistic concurrency in one sentence."}'
```

Read the response envelope and check `ok` before using its data. Invalid credentials return an authentication error; oversized requests are rejected. In production, replace the demo token check with the host's session provider and configure the rate-limit provider. Keep model credentials server-side and configure scoped trace storage before enabling trace/feedback features. The mount prefix belongs to the HTTP adapter; the LangFn router's routes remain `/complete`, `/chat`, and so on.

## Streaming Express bridge

Save this as `langfn-express.ts` next to `server.ts`. It pipes the Web response with backpressure and aborts the request signal on disconnect, including during `/stream`. It does not buffer an entire SSE response before sending it.

```ts
import type { RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

type WebRouter = { handle(request: Request): Promise<Response | null> };

export function langFnHandler(router: WebRouter): RequestHandler {
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
      // Express strips the mount prefix from req.url while this mounted handler runs.
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
    })().catch((error) => {
      if (!controller.signal.aborted) next(error);
    }).finally(() => {
      req.off("aborted", abort);
      res.off("close", abort);
    });
  };
}
```
