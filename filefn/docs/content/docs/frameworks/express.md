---
title: Express
description: Production-grade Express integration for filefn — Web Request bridging, body streaming for proxy uploads, CSRF, and rate limiting.
---

# Express

Express's `req` / `res` objects aren't `Request` / `Response`. You need to bridge them. filefn ships a helper:

```ts
import express from "express";
import { createFileFn } from "@filefn/server";
import { adaptNodeHandler } from "@filefn/server/adapters/node";

const fileFn = createFileFn({ /* ... */ });

const app = express();

app.all("/filefn/*", adaptNodeHandler(fileFn.router.handle));

app.listen(3000);
```

`adaptNodeHandler`:

- builds a `Request` from `req` (including the streamed body for `PUT` proxy uploads).
- converts the returned `Response` to `res.write()` / `res.end()`.
- preserves response headers (including `Set-Cookie`).
- passes through `null` to a 404.

## Body parsing

**Don't** use `express.json()` / `express.urlencoded()` on `/filefn/*`. The kernel reads its own JSON; pre-parsed bodies break PUTs.

```ts
app.use("/api/non-filefn", express.json());
app.all("/filefn/*", adaptNodeHandler(fileFn.router.handle));
```

## CSRF

```ts
import { csrfProtection } from "your-csrf-middleware";

app.use("/filefn/*", csrfProtection({
  exemptMethods: ["GET", "HEAD"],
  // proxy PUT routes need a token check; either pass the CSRF token via header or require auth.required: true
}));
```

filefn's anonymous upload tokens (`x-upload-session-token`) defend the proxy `PUT` routes against cross-tenant attacks but not against CSRF — pair them with a CSRF-token header check or with `auth.required: true` on top.

## Rate limiting

Either use Express middleware (`express-rate-limit`) keyed by IP / user, or use filefn's built-in `rateLimit` config — which runs *inside* the kernel and applies before storage / DB work.

## See also

- [Quickstart › Express](../quickstart/express) — minimal version.
