---
title: Observability
description: How filefn handles request IDs, structured logging, metrics, and secret redaction.
---

# Observability

filefn ships with three observability primitives:

- **Structured events** — covered in [Events](./events).
- **Pluggable logger** — `@filefn/server` exposes a `Logger` interface that defaults to `console`.
- **Secret redaction** — every log line, every event payload, every error response gets the same redaction pass.

## Logger

```ts
interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

interface LogContext {
  requestId?: string;
  fileId?: string;
  uploadSessionId?: string;
  principalId?: string;
  tenantId?: string;
  [key: string]: unknown;
}
```

Pass your own:

```ts
import pino from "pino";

const logger = pino();

const fileFn = createFileFn({
  db, storage,
  logger: {
    debug: (msg, ctx) => logger.debug(ctx, msg),
    info: (msg, ctx) => logger.info(ctx, msg),
    warn: (msg, ctx) => logger.warn(ctx, msg),
    error: (msg, ctx) => logger.error(ctx, msg),
  },
});
```

Or use the bundled `createLogger`:

```ts
import { createLogger } from "@filefn/server";

const logger = createLogger({
  level: "info",
  redactKeys: ["password", "secret"], // additional keys
});
```

## Request IDs

Every request flows through filefn with an `x-request-id` header. If the caller doesn't set one, the kernel mints one (`req_<random>`). The id is:

- echoed in `x-request-id` on the response
- included in every event (`requestId` field)
- threaded into every log line for the request

This makes correlating "what happened to upload_xyz" easy: grep the request id, see the upload init, every part record, the complete, the processing trigger, and any error in chronological order.

## Secret redaction

`redactSecrets` is exported from `@filefn/server`:

```ts
import { redactSecrets } from "@filefn/server";

const safe = redactSecrets({
  url: "https://...?Signature=ABC",
  authorization: "Bearer eyJ…",
  bystander: "kept as-is",
});
// → { url: "https://...?Signature=[REDACTED]", authorization: "[REDACTED]", bystander: "kept as-is" }
```

The redactor strips:

- common signed-URL parameters (`X-Amz-Signature`, `Signature`, `sig`, `token`, `key`)
- `Bearer …` JWT/opaque tokens
- known token prefixes (`upls_live_…`)
- any field whose key contains `token`, `secret`, `password`, `signature`, `signedurl`, or `authorization`

Run it on anything that's about to leave the process — webhooks, log lines, error reporters.

## Metrics

filefn doesn't ship a metrics adapter. The recommended pattern is event-driven:

```ts
fileFn.events.on("file:uploaded", (e) => metrics.counter("filefn.uploads.complete").inc());
fileFn.events.on("file:deleted", (e) => metrics.counter("filefn.deletes").inc());
fileFn.events.on("processing.completed", (e) => {
  metrics.histogram("filefn.processing.artifacts").observe(e.artifactsCreated);
});
fileFn.events.on("processing.failed", (e) => metrics.counter("filefn.processing.failed").inc());
```

For the upload-mid metrics (bytes/sec, parts in flight), instrument the storage adapter or the Hono / Express middleware around `/filefn/*`.

## Health check

filefn does not have a built-in `/health` endpoint. Mount your own:

```ts
app.get("/health", async (c) => {
  const dbHealthy = await db.isHealthy?.();
  return c.json({ ok: true, db: dbHealthy?.healthy ?? false });
});
```

Adapters that implement `isHealthy()` can be probed; otherwise just check connectivity.

## Tracing

The kernel doesn't open OpenTelemetry spans yet. The right place to add tracing today is your HTTP middleware (Hono / Express / Next.js) — wrap each `/filefn/*` request in a span and pass the span context as `x-request-id`. Open an issue if you want first-class OTel support.
