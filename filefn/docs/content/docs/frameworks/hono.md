---
title: Hono
description: Production-grade Hono integration for filefn — CORS, CSRF for proxy uploads, rate limiting, observability, and graceful 404 fallthrough.
---

# Hono

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { createFileFn, createNucleusPolicies } from "@filefn/server";
import { createAuthFn } from "@authfn/server";
import { createPostgresAdapter } from "@superfunctions/db-postgres";
import { createS3Storage } from "@superfunctions/storage";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = createPostgresAdapter({ pool });
const storage = createS3Storage({
  region: process.env.AWS_REGION!,
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const authFn = createAuthFn({ db, /* ... */ });

const fileFn = createFileFn({
  db, storage,
  policies: createNucleusPolicies(),
  auth: {
    resolveSession: async (req) => {
      const session = await authFn.getSession(req);
      return session ? { principalId: session.userId, tenantId: session.tenantId } : null;
    },
    required: false,
  },
});

const app = new Hono();
app.use("*", logger());
app.use("*", compress());
app.use(
  "/filefn/*",
  cors({
    origin: process.env.APP_ORIGIN!,
    allowHeaders: ["content-type", "authorization", "x-request-id", "x-idempotency-key", "x-upload-session-token"],
    exposeHeaders: ["x-request-id", "etag"],
    credentials: true,
  })
);

app.all("/filefn/*", async (c) => {
  const response = await fileFn.router.handle(c.req.raw);
  return response ?? c.notFound();
});
```

## CSRF

filefn's auth path is enforced by `auth.resolveSession`. For browser-issued proxy uploads (`PUT /upload/:id/parts/:n`), pair filefn with your authfn CSRF protection. The bundled clients send credentials by default; on the server, validate the `Origin` / `Referer` header on every state-changing route.

## Rate limiting

Use the `rateLimit` config:

```ts
const fileFn = createFileFn({
  db, storage,
  rateLimit: {
    persistence: redisPersistence,
    algorithm: "sliding-window",
    limits: {
      uploadInit: { windowSeconds: 60, maxRequests: 10 },
      uploadSign: { windowSeconds: 60, maxRequests: 600 },
    },
  },
});
```

For multi-instance deployments, plug in a shared persistence (Redis, KV).

## Observability

```ts
const fileFn = createFileFn({
  db, storage,
  logger: {
    info(msg, meta) { console.log("info", msg, meta); },
    warn(msg, meta) { console.warn("warn", msg, meta); },
    error(msg, meta) { console.error("error", msg, meta); },
  },
});
```

The kernel emits structured logs for every route hit, redacting tokens automatically.

## Reverse proxy

Behind a reverse proxy (Cloudflare, ALB), set `Trust-Forwarded-Headers` and ensure:

- `X-Forwarded-For` is preserved (for rate-limit keying by IP).
- `X-Forwarded-Proto` is preserved (for signed-URL host correctness).
- WebSocket / SSE — filefn doesn't currently use either; no special config.

## See also

- [Quickstart › Hono](../quickstart/hono) — minimal version.
- [Examples › Production](../examples/production) — full repo.
