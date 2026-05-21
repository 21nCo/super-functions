---
title: Next.js
description: Production-grade Next.js integration — App Router catch-all route, edge-vs-Node runtime tradeoffs, server actions for upload init.
---

# Next.js

filefn works with both the App Router and Pages Router. The recommended setup is App Router.

## App Router

```ts
// src/lib/server/filefn.ts
import { createFileFn, createNucleusPolicies } from "@filefn/server";

export const fileFn = createFileFn({
  /* db, storage, auth, ... */
  policies: createNucleusPolicies(),
});
```

```ts
// src/app/filefn/[...path]/route.ts
import { fileFn } from "@/lib/server/filefn";

async function handler(request: Request) {
  return (await fileFn.router.handle(request)) ?? new Response("Not Found", { status: 404 });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;

// Set runtime explicitly. Edge can't use Node-only adapters (sharp, ffmpeg, native pg).
export const runtime = "nodejs";

// File uploads can be large. Bump the body parser limit.
export const dynamic = "force-dynamic";
```

## Edge vs. Node runtime

| Runtime | OK for |
| --- | --- |
| `nodejs` | All adapters; processing pipelines that shell out (ffmpeg) or use `sharp`. |
| `edge` | S3 / GCS / R2 storage; in-memory or Drizzle-via-HTTP DB; no inline processing (use queued processing via `@flowfn/server` against an external worker). |

For typical production filefn deployments, `nodejs` is the right choice.

## Pages Router

```ts
// pages/api/filefn/[...path].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adaptNodeHandler } from "@filefn/server/adapters/node";
import { fileFn } from "@/lib/server/filefn";

const handler = adaptNodeHandler(fileFn.router.handle);

export default function (req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res);
}

export const config = {
  api: {
    bodyParser: false,        // filefn reads the body itself
    responseLimit: false,     // unbounded download responses
  },
};
```

## Client component

```tsx
"use client";
import { createFileFnClient } from "@filefn/client";
import { useState } from "react";

const client = createFileFnClient({ baseUrl: "/filefn", offline: { enabled: true } });

export function Upload() {
  const [progress, setProgress] = useState(0);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    const handle = client.uploadFile({ policy: "public-image", file });
    handle.onProgress(({ bytesUploaded, bytesTotal }) => {
      setProgress((bytesUploaded / bytesTotal) * 100);
    });
    const result = await handle.done();
    console.log("uploaded", result);
  }

  return (
    <>
      <input type="file" accept="image/*" onChange={onChange} />
      {progress > 0 && progress < 100 && <progress value={progress} max={100} />}
    </>
  );
}
```

## Server actions

For *initiating* uploads from a server action (e.g. mint an idempotency key, pre-create an empty record):

```ts
"use server";
import { fileFn } from "@/lib/server/filefn";
import { revalidatePath } from "next/cache";

export async function startUpload(formData: FormData) {
  const session = await fileFn.createUploadSession(
    {
      fileName: formData.get("name") as string,
      mimeType: formData.get("mimeType") as string,
      size: Number(formData.get("size")),
      policy: "public-image",
    },
    { principalId: getServerUserId() },
  );
  return session;
}
```

The browser still does the actual byte transfer through `client.uploadFile` / `client.resumeUpload(session.uploadSessionId, file)`.

## See also

- [Quickstart › Next.js](../quickstart/nextjs) — minimal version.
