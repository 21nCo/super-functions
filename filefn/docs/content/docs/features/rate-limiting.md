---
title: Rate limiting
description: Per-route rate limiting on upload-init, sign, complete, download, share-download, and artifact-download.
---

# Rate limiting

See [Core Concepts › Rate limiting](../core-concepts/rate-limiting) for the conceptual overview and recommended starting limits. This page is the operator-facing reference.

## Wiring

```ts
import { createFileFn } from "@filefn/server";

const fileFn = createFileFn({
  db, storage,
  stores: { kv: sharedKv },
  rateLimit: {
    mode: "best-effort", // or "local" without a store
    algorithm: "sliding-window",
    limits: {
      uploadInit:        { windowSeconds: 60, maxRequests: 10 },
      uploadSign:        { windowSeconds: 60, maxRequests: 600 },
      uploadComplete:    { windowSeconds: 60, maxRequests: 30 },
      download:          { windowSeconds: 60, maxRequests: 120 },
      shareDownload:     { windowSeconds: 60, maxRequests: 60 },
      artifactDownload:  { windowSeconds: 60, maxRequests: 600 },
    },
  },
});
```

`rateLimit.limits` accepts any subset of categories — categories you don't list aren't limited.

`rateLimit.algorithm` is one of `"fixed-window" | "sliding-window" | "token-bucket"`.

For strict shared limits, use `stores.atomicKv` with `rateLimit.mode: "strict"` and a CAS-capable adapter. For best-effort shared limits, use `stores.kv` with `rateLimit.mode: "best-effort"`. Use `persistence` only when calling `createRateLimiter` directly.

## Pre-built rate limiter

```ts
import { createRateLimiter } from "@superfunctions/middleware";

const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  persistence: redisPersistence,
});

const fileFn = createFileFn({
  db, storage,
  rateLimiter: limiter, // applied to every route
});
```

Use this when you want a single bucket for all routes. Combine with `rateLimit.limits` if you want per-category limits on top of a global cap.

## Errors

`FILEFN_RATE_LIMITED` (HTTP 429) with `details.resetAt` (ISO timestamp). The bundled clients handle the retry-after themselves.

## See also

- [Core Concepts › Rate limiting](../core-concepts/rate-limiting) — picking limits, persistence options.
