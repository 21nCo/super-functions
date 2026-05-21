---
title: Getting Started
description: Install filefn, mount it on Hono, configure a storage policy, and upload your first file end to end in 15 minutes.
---

# Getting Started

This walkthrough takes you from zero to a running file server with multipart uploads, signed URLs, and a verified end-to-end upload. It uses Node + Hono + an in-memory database + the local filesystem as the storage adapter, but every step maps cleanly to S3 / Postgres / SvelteKit / Next.js / FastAPI in [Quickstart](./quickstart).

## 1. Install

```bash
npm install @filefn/server @superfunctions/storage @superfunctions/db hono @hono/node-server
npm install @filefn/client
```

For S3-style storage in production you'd add `@superfunctions/storage-s3`. For Postgres you'd add `@superfunctions/db` with the Drizzle adapter. Both swap in without changing application code — see [Adapters](./adapters).

## 2. Pick a database adapter

filefn writes through `@superfunctions/db`'s `Adapter` interface. For local development:

```ts
import { memoryAdapter } from "@superfunctions/db/adapters/memory";

const db = memoryAdapter({ debug: false });
```

The in-memory adapter is fine for tests and quickstarts; data is lost on restart. For production wiring see [Adapters › Database](./adapters/db).

## 3. Pick a storage adapter

```ts
import { createLocalStorageAdapter } from "@superfunctions/storage";

const storage = createLocalStorageAdapter({
  rootDir: "./.filefn-storage",
});
```

The local adapter is filesystem-backed and supports the proxy-download path that filefn uses when an adapter does not expose signed-URL downloads. For S3, GCS, Azure, or R2 see [Adapters › Storage](./adapters/storage).

## 4. Create the kernel

```ts
import { createFileFn } from "@filefn/server";

const fileFn = createFileFn({
  db,
  storage,
  policies: [
    {
      name: "public-image",
      contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      maxSizeBytes: 10 * 1024 * 1024,
      visibility: "public",
    },
    {
      name: "private-document",
      contentTypes: ["application/pdf", "text/plain"],
      maxSizeBytes: 100 * 1024 * 1024,
      visibility: "private",
    },
  ],
  auth: {
    // Replace this with your real session resolver. See Frameworks.
    resolveSession: async () => ({ principalId: "demo-user", tenantId: "demo-org" }),
    required: true,
  },
});
```

This call:

- registers the `public-image` and `private-document` policies (uploads must reference one of them by name)
- creates the canonical schema (`files`, `fileVersions`, `uploadSessions`, `uploadParts`, `filePermissions`, `fileShares`, `fileArtifacts`)
- wires the upload, file, share-link, grant, processing, policy, and quota route trees into a single `fileFn.router`
- exposes a `fileFn.events` emitter you can subscribe to for observability

## 5. Mount the router

filefn ships a runtime-agnostic `Request → Response` router. Mount it on Hono:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.all("/filefn/*", async (c) => {
  const url = new URL(c.req.raw.url);
  const stripped = url.pathname.replace(/^\/filefn/, "") || "/";
  const forwarded = url.origin + stripped + url.search;

  const newReq = new Request(forwarded, {
    method: c.req.method,
    headers: c.req.header() as any,
    body: c.req.raw.body,
    duplex: "half",
  } as any);

  const response = await fileFn.router.handle(newReq);
  return response ?? c.notFound();
});

serve({ fetch: app.fetch, port: 3001 });
console.log("filefn listening on http://localhost:3001/filefn");
```

You can do the same with Express, Bun.serve, or SvelteKit's hooks — see [Frameworks](./frameworks).

## 6. Sign in and upload from the client

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "http://localhost:3001/filefn",
  // Real apps would inject session cookies or bearer tokens here.
  getAuthHeaders: async () => ({}),
});

const file = new File([new Uint8Array([1, 2, 3])], "hello.png", { type: "image/png" });
const handle = client.uploadFile({
  policy: "public-image",
  file,
});

handle.onProgress(({ bytesUploaded, bytesTotal }) => {
  console.log(`${Math.round((bytesUploaded / bytesTotal) * 100)}%`);
});

const { fileId, versionId } = await handle.done();
console.log("Uploaded", fileId, versionId);
```

`uploadFile()`:

1. POSTs `/filefn/upload/init` with `{ policy, fileName, mimeType, size }` (and an optional `idempotencyKey`)
2. Receives an `uploadSessionId`, an anonymous `uploadSessionToken`, the negotiated chunk size, and the total parts
3. POSTs `/filefn/upload/{id}/parts/{n}/sign` for each part
4. PUTs the part bytes to either the signed URL (S3-style) or `/filefn/upload/{id}/parts/{n}` in proxy mode
5. POSTs `/filefn/upload/{id}/parts/{n}/complete` with the recorded etag
6. POSTs `/filefn/upload/{id}/complete` and returns `{ fileId, versionId }`

For very small files there's still exactly one part — the multipart machinery is the only path, and that's intentional: it keeps the resume / cancel / status story uniform regardless of size.

## 7. List, render, and download

```ts
const file = await client.getFile(fileId);
console.log(file.name, file.size, file.mimeType);

// Render-intent-aware: returns the right artifact (thumbnail/preview/full)
// or falls back to a placeholder descriptor when not ready yet.
const renderable = await client.resolveRenderable({
  fileId,
  intent: "preview",
});

if (renderable.source.mode === "original" || renderable.source.mode === "artifact") {
  document.querySelector("img")?.setAttribute("src", renderable.source.url);
}

// Or get a one-off signed URL for the original
const url = await client.downloadUrl(fileId);
```

`resolveRenderable` is the recommended path: it works with the [processing](./features/processing) pipeline, returns artifact URLs when they exist, and degrades cleanly to placeholders while a thumbnail or PDF preview is still being generated.

## 8. Subscribe to events

```ts
fileFn.events.on("file:uploaded", (event) => {
  console.log(`uploaded ${event.fileName} → ${event.fileId}`);
});

fileFn.events.on("processing.completed", (event) => {
  console.log(`processed ${event.fileId}, artifacts=${event.artifactsCreated}`);
});
```

Every event is sanitised — signed URLs, session tokens, and bearer tokens are redacted to `[REDACTED]` before they reach your handler. See [Core Concepts › Events](./core-concepts/events) for the full event catalog.

## 9. Where to go from here

- **Make it real**: swap `memoryAdapter` for Drizzle/Postgres and `createLocalStorageAdapter` for `createS3StorageAdapter` — see [Adapters](./adapters).
- **Lock it down**: provide a real `auth.resolveSession`, configure rate limits per route, and wire `quota` — see [Core Concepts › Security](./core-concepts/security) and [Reference › Configuration](./reference/configuration).
- **Add processing**: enable `processing.enabled` and pass `createThumbnailProcessor()`, `createPdfPreviewProcessor()`, etc. — see [Features › Processing](./features/processing).
- **Go offline**: enable `offline.enabled` on the client to stage uploads in OPFS and replay on reconnect — see [Core Concepts › Offline](./core-concepts/offline).
- **Mobile**: install `FileFnClient` from SPM and use `FileFnBackgroundUploader` for background-safe uploads — see [SDKs › Swift](./sdk/swift).

## When something breaks

- **`FILEFN_NO_SUPPORTED_UPLOAD_MODE`** — your storage adapter does not support the upload mode that the negotiated chunk size implies. Use a different adapter, raise the chunk size, or enable proxy mode.
- **`FILEFN_POLICY_NOT_FOUND`** — the `policy` name you sent in `uploadFile` was not registered. Check the policies you passed to `createFileFn`.
- **`FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED`** — the file's MIME type is not on the policy's `contentTypes` allowlist. Either expand the policy or pick a different one.
- **`FILEFN_AUTH_REQUIRED`** — your `auth.resolveSession` returned `null` and `auth.required` was true. Wire your real auth.
- **`FILEFN_SESSION_TOKEN_REQUIRED` / `FILEFN_SESSION_TOKEN_INVALID`** — the upload session token returned by `/upload/init` is required for subsequent part operations and must be sent as `x-upload-session-token`. The bundled clients handle this automatically; if you're calling the API by hand, see [Reference › Routes](./reference/routes).

For the full error catalog see [Reference › Errors](./reference/errors).
