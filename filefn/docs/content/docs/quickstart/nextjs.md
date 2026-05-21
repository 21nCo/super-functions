---
title: Next.js Quickstart
description: Mount filefn on Next.js App Router with a route.ts catch-all under app/filefn/[...path].
---

# Next.js (App Router)

Next.js exposes the Web `Request` API in App Router route handlers, so filefn slots in directly.

## Install

```bash
npm install @filefn/server @superfunctions/storage @superfunctions/db
```

## Kernel singleton

`app/server/filefn.ts`:

```ts
import "server-only";
import { createFileFn } from "@filefn/server";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createLocalStorageAdapter } from "@superfunctions/storage";

export const fileFn = createFileFn({
  db: memoryAdapter({ debug: false }),
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
```

## Catch-all route

`app/filefn/[...path]/route.ts`:

```ts
import { fileFn } from "@/server/filefn";

async function handler(request: Request) {
  const url = new URL(request.url);
  const stripped = url.pathname.replace(/^\/filefn/, "") || "/";
  const forwarded = new Request(url.origin + stripped + url.search, request);

  const response = await fileFn.router.handle(forwarded);
  return response ?? new Response("Not Found", { status: 404 });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = "force-dynamic";
```

`force-dynamic` keeps Next.js from trying to statically optimise the multipart upload routes.

## Streaming uploads

Multipart upload parts can be large. App Router accepts `request.body` as a Web `ReadableStream`, which `fileFn.router.handle` forwards directly into the storage adapter — no buffering through `formData()`.

If you're using the Node middleware for upload size limits, lift them. filefn enforces `maxSizeBytes` per policy, not globally.

## Edge vs. Node runtime

filefn itself runs in both Edge and Node runtimes; the limit is your storage adapter. `createLocalStorageAdapter` is Node-only. `createS3StorageAdapter` and `createR2StorageAdapter` work in both. Pin the runtime explicitly:

```ts
export const runtime = "nodejs"; // or "edge"
```

## Next steps

- [Frameworks › Next.js](../frameworks/nextjs) — reading session cookies in `auth.resolveSession`, streaming downloads, and Vercel-friendly storage.
- [Adapters › Storage › R2](../adapters/storage-r2) — running filefn on Cloudflare-backed Next.js / Vercel.
