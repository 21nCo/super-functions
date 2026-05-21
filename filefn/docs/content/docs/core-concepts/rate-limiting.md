---
title: Rate limiting
description: Per-route rate limits using @superfunctions/middleware on top of filefn's upload, download, share-download, and artifact-download endpoints.
---

# Rate limiting

filefn integrates with `@superfunctions/middleware`'s `RateLimiter` to throttle the routes that actually matter.

## Configuration

```ts
const fileFn = createFileFn({
  db, storage,
  rateLimit: {
    persistence: redisPersistence,        // or undefined for in-memory
    algorithm: "sliding-window",          // or "fixed-window" | "token-bucket"
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

Or pass a pre-built `rateLimiter` directly:

```ts
import { createRateLimiter } from "@superfunctions/middleware";

const limiter = createRateLimiter({ /* ... */ });

const fileFn = createFileFn({
  db, storage,
  rateLimiter: limiter,
});
```

`rateLimiter` (alone) applies the same limit to every route. `rateLimit.limits` (per-category) is the recommended path.

## Categories

| Category | Routes |
| --- | --- |
| `uploadInit` | `POST /upload/init` |
| `uploadSign` | `POST /upload/:id/parts/:n/sign` |
| `uploadComplete` | `POST /upload/:id/parts/:n/complete`, `POST /upload/:id/complete`, `POST /upload/:id/abort` |
| `download` | `GET /:fileId/download`, `GET /:fileId/versions/:versionId/download`, `GET /proxy/files/:fileId/download` |
| `shareDownload` | `GET /share-links/:token/download`, `GET /proxy/share-links/:token/download` |
| `artifactDownload` | `GET /:fileId/artifacts/:artifactId/download` |

Routes not in any category (read-only file metadata, listing, render-descriptor) aren't rate-limited by filefn. Apply your framework's middleware on top if you want a global cap.

## Algorithms

- **`fixed-window`** — counts requests inside a fixed time window. Simplest, but bursty at boundaries.
- **`sliding-window`** — smooths out the boundary effect. Default for the production examples.
- **`token-bucket`** — burst-friendly, refill over time. Best when you have legitimate bursty traffic (e.g. mass uploads from a script).

## Persistence

In-memory persistence is fine for development and single-instance deployments. For multi-instance / Edge / load-balanced deployments, use a shared persistence:

- Redis (recommended)
- Postgres
- Cloudflare KV

`@superfunctions/middleware` ships persistence implementations or accepts your own.

## What clients see

When a request is throttled:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
{
  "ok": false,
  "error": {
    "code": "FILEFN_RATE_LIMITED",
    "message": "Rate limit exceeded",
    "details": { "resetAt": "2025-01-01T00:00:30.000Z" }
  }
}
```

`details.resetAt` is the timestamp when the next request is expected to succeed. Bundled clients respect this and back off automatically.

## Picking limits

Defaults aren't shipped — operators know their traffic. A reasonable starting point:

| Category | Per-IP limit (per minute) |
| --- | --- |
| `uploadInit` | 60 (1/sec) |
| `uploadSign` | 1200 |
| `uploadComplete` | 120 |
| `download` | 120 |
| `shareDownload` | 60 |
| `artifactDownload` | 600 |

Tune up if you have legitimate burst patterns (image-heavy galleries, CI artifact downloads). Tune down if you're seeing scraping.
