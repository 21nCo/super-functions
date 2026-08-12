---
title: Architecture
description: How filefn separates upload sessions, files, share links, grants, processing, and adapters into composable subsystems.
---

# Architecture

filefn is a kernel: a small set of orthogonal subsystems wired together by `createFileFn(config)`. Each subsystem owns a slice of the schema, a slice of the routes, and a slice of the event catalog.

## Subsystems

### Upload sessions
Owns `uploadSessions` and `uploadParts`. Negotiates the upload mode (signed-URL multipart vs. proxy), enforces idempotency, signs / records parts, and finalises the file by minting a `fileVersions` row.

Routes: `POST /upload/init`, `GET /upload/:id/status`, `POST /upload/:id/parts/:n/sign`, `POST /upload/:id/parts/:n/complete`, `PUT /upload/:id/parts/:n` (proxy mode), `POST /upload/:id/complete`, `POST /upload/:id/abort`.

Events: `upload.started`, `part.recorded`, `file:uploaded`.

### Files
Owns `files` and `fileVersions`. List/get/delete/download/render endpoints, version listing, version-targeted downloads, proxy download routes.

Routes: `GET /`, `GET /:fileId`, `DELETE /:fileId`, `GET /:fileId/download`, `GET /:fileId/render`, `GET /:fileId/versions`, `GET /:fileId/versions/:versionId`, `GET /:fileId/versions/:versionId/download`, `GET /proxy/files/:fileId/download`, `GET /proxy/files/:fileId/versions/:versionId/download`.

Events: `file:deleted`.

### Share links
Owns `fileShares`. Optional. Mints opaque tokens, enforces TTLs and download caps, and exposes auth-free or auth-required downloads.

Routes: `POST /:fileId/share-links`, `GET /:fileId/share-links`, `DELETE /:fileId/share-links/:token`, `GET /share-links/:token/download`, `GET /proxy/share-links/:token/download`.

### Grants (permissions)
Owns `filePermissions`. Optional. Per-user / per-tenant grants with TTL and the four canonical capabilities (`canRead`, `canWrite`, `canDelete`, `canShare`).

Routes: `POST /:fileId/permissions`, `GET /:fileId/permissions`, `DELETE /:fileId/permissions/:permissionId`.

### Processing
Owns `fileArtifacts`. Optional. Runs registered `Processor` instances after a successful upload (or on demand) to produce thumbnails, PDF previews, OCR text, etc. Backed by `@filefn/processing`.

Routes: `GET /:fileId/artifacts`, `GET /:fileId/artifacts/:artifactId/download`, `GET /proxy/files/:fileId/artifacts/:artifactId/download`, `POST /:fileId/process`.

Events: `processing.started`, `processing.completed`, `processing.failed`.

### Policies
Read-only registry of named upload policies (content types, max size, visibility, storage target, storage path layout, render profile). Drives everything else.

Route: `GET /policies`.

### Quota
Optional. Pluggable `QuotaProvider` that participates in upload-session sizing checks.

Route: `GET /quota/storage`.

## Layered composition

```
+--------------------------------------------+
| Your HTTP framework (Hono / Express / …)   |
+----------------------+---------------------+
                       |
+----------------------v---------------------+
| fileFn.router (single Request → Response)  |
|  ├── upload routes                         |
|  ├── file routes                           |
|  ├── share-link routes      (optional)     |
|  ├── grant routes           (optional)     |
|  ├── processing routes      (optional)     |
|  ├── policy routes                         |
|  └── quota routes                          |
+----------------------+---------------------+
                       |
+----------------------v---------------------+
| Services (upload, file, shares, grants, …) |
+--+----+-----+-----+----+--------------+---+
   |    |     |     |    |              |
   v    v     v     v    v              v
+-----+ +---+ +---+ +---+ +--------+  +-------+
| DB  | |Stg| |Quo| |Rl | |Authzr  |  |Procrs |
+-----+ +---+ +---+ +---+ +--------+  +-------+
```

- **DB** — `@superfunctions/db` `Adapter`. Memory / Drizzle / Postgres / SQLite / your own.
- **Storage** — `@superfunctions/storage` `StorageAdapter`. Local FS / S3 / GCS / Azure / R2 / your own.
- **Quo (Quota)** — your `QuotaProvider`. Optional.
- **Rl (Rate limiter)** — `@superfunctions/middleware`. Optional.
- **Authorizer** — your `Authorizer`. Optional. Drives grants + visibility decisions.
- **Procrs (Processors)** — `Processor[]`. Optional. Backed by `@filefn/processing` providers.

## Two upload modes

Multipart uploads happen in one of two modes, picked per session by the storage adapter:

1. **`multipart-signed-url`** — the server signs a per-part URL; the client PUTs bytes directly to the storage backend (S3, GCS, R2). filefn never touches the bytes.
2. **`proxy`** — the client PUTs bytes to filefn at `PUT /upload/:id/parts/:n`. filefn streams them through to the storage adapter. Used when the adapter doesn't support signed URLs (local FS) or when you explicitly want to inspect/transform bytes server-side.

The negotiation is invisible to the client SDKs — `@filefn/client`, the Python client, and the Swift client all handle both modes from the `uploadMode` field in the init response.

## Why this shape

The kernel resists three temptations:

1. **It does not know about your auth.** `auth.resolveSession` and `authorizer` plug in, but the kernel itself does not store users. It treats every request as carrying a `principalId` (and optional `tenantId`) — it's your job to derive those from cookies / JWTs / API keys.
2. **It does not know about your storage layout.** Every `Policy.storagePath` is a function of `(tenantId, principalId, fileId, versionId, fileName)`. There's a sane default; you can swap it per policy without touching the kernel.
3. **It does not assume you've turned everything on.** Share links, grants, processing, dedup, and quota are all optional. Skipping any of them removes its routes from the surface, removes its tables from the schema, and removes its events from the catalog.

The result is a small, composable kernel where adding a feature is mostly turning on a config flag, and removing one is mostly turning that flag off.
