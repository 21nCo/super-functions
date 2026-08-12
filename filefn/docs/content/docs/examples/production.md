---
title: Production setup
description: Multi-policy filefn server with auth, processing, S3 storage, and Postgres rows — production-shaped reference.
---

# Production setup

The production example mirrors what a small real deployment looks like:

- Three policies (`images`, `documents`, `general`) with realistic limits.
- Drizzle + Postgres rows.
- S3 (or MinIO / LocalStack) for bytes.
- Auth gating with a demo-mode override.
- Thumbnail processing.
- A `/filefn/*` mount with explicit prefix stripping.
- An idempotent `bootstrap()` that creates tables and indexes on first run.

Located at `filefn/examples/production/`.

## Layout

```
filefn/examples/production/
├── client/                       # SvelteKit (production-shaped UI)
└── server/
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── db.ts                  # Drizzle + Postgres
        ├── schema.ts              # Drizzle schema declarations
        └── index.ts               # Hono + filefn + S3 + processing
```

## .env

```
DATABASE_URL=postgres://user:pass@host:5432/filefn_demo
FILEFN_DEMO_MODE=true
AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# S3_BUCKET=filefn-demo
# S3_ENDPOINT=http://localhost:9000   # for MinIO
PORT=3001
```

## Server entry

```ts
const fileFn = createFileFn({
  db: adapter,
  storage,
  policies: [
    { name: "images", contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"], maxSizeBytes: 50 * 1024 * 1024, visibility: "public" },
    { name: "documents", contentTypes: ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], maxSizeBytes: 100 * 1024 * 1024, visibility: "private" },
    { name: "general", maxSizeBytes: 200 * 1024 * 1024, visibility: "private" },
  ],
  auth: {
    required: !demoMode,
    resolveSession: async (request) => {
      if (demoMode) return { principalId: "demo-user", tenantId: "demo-org" };
      // wire authfn / your IDP here
      return null;
    },
  },
  processing: {
    enabled: true,
    processors: [createThumbnailProcessor()],
  },
});
```

The route mount strips `/filefn` prefix and forwards the request to the kernel:

```ts
app.all("/filefn/*", async (c) => {
  const url = new URL(c.req.raw.url);
  const newPath = url.pathname.replace(/^\/filefn/, "") || "/";
  const newUrl = url.origin + newPath + url.search;
  const newReq = new Request(newUrl, {
    method: c.req.method,
    headers: c.req.header() as any,
    body: c.req.raw.body,
    duplex: "half",
  } as any);
  return (await fileFn.router.handle(newReq)) ?? c.notFound();
});
```

## Bootstrap

`bootstrap()` runs `CREATE TABLE IF NOT EXISTS` for every filefn table plus indexes on the hot lookup paths (`owner_id`, `tenant_id`, `checksum_sha256_base64`, `idempotency_key`, `expires_at`). Idempotent — safe to run on every boot.

For real production, prefer your migration tool (Drizzle Kit, Atlas, custom). Use `getSchema()` and the bundled SQL generators rather than maintaining the SQL by hand.

## Auth

`FILEFN_DEMO_MODE=true` returns a static `{ principalId: "demo-user", tenantId: "demo-org" }`. In real deployments, replace it with `authFn.getSession(request)` — see [Frameworks › Hono](../frameworks/hono).

## Storage

The example wires `createS3StorageAdapter`. Set `S3_ENDPOINT=http://localhost:9000` and `forcePathStyle: true` to point at MinIO / LocalStack instead of AWS. The same adapter works against R2 with `endpoint` set to your account's R2 URL.

## Run it

```bash
cd filefn/examples/production/server
cp .env.example .env
# Fill in DATABASE_URL and (optional) S3 creds.
npm install
npm run dev
```

The server listens on `:3001`. Hit `GET /health` to confirm DB connectivity. Then point the example client at `http://localhost:3001/filefn`.

## See also

- [Adapters › S3](../adapters/storage-s3).
- [Adapters › Postgres](../adapters/db-postgres).
- [Recipes › CDN integration](../recipes/cdn-integration) — for production read paths.
