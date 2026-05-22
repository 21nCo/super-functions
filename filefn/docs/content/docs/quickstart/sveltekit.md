---
title: SvelteKit Quickstart
description: Mount filefn on SvelteKit with a +server.ts catch-all under /filefn.
---

# SvelteKit

SvelteKit can host filefn as a server route under any prefix. The server runs in the SvelteKit Node / Bun / Cloudflare adapter — pick whichever matches your storage adapter.

## Install

```bash
npm install @filefn/server @superfunctions/storage @superfunctions/db
```

## Server (server.ts)

Keep the kernel out of `+server.ts` so it survives HMR. Create `src/lib/server/filefn.ts`:

```ts
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

Create `src/routes/filefn/[...path]/+server.ts`:

```ts
import type { RequestHandler } from "./$types";
import { fileFn } from "$lib/server/filefn";

const handle: RequestHandler = async ({ request, url }) => {
  const stripped = url.pathname.replace(/^\/filefn/, "") || "/";
  const forwarded = new Request(url.origin + stripped + url.search, request);

  const response = await fileFn.router.handle(forwarded);
  return response ?? new Response("Not Found", { status: 404 });
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
```

## Connect SvelteKit auth

Use `event.locals.session` to wire `auth.resolveSession`:

```ts
// src/lib/server/filefn.ts
export const fileFn = createFileFn({
  db,
  storage,
  policies,
  auth: {
    required: true,
    resolveSession: async (request) => {
      // SvelteKit-issued session cookie / JWT — your shape goes here.
      const cookie = request.headers.get("cookie");
      const session = parseSessionCookie(cookie);
      if (!session) return null;
      return { principalId: session.userId, tenantId: session.tenantId };
    },
  },
});
```

## Client (browser)

```ts
// src/lib/filefn.ts
import { createFileFnClient } from "@filefn/client";

export const filefn = createFileFnClient({
  baseUrl: "/filefn",
  getAuthHeaders: async () => ({}),
  offline: { enabled: true },
});
```

`offline.enabled` activates the OPFS-staged offline pipeline — uploads survive page reloads and reconnect automatically. See [Core Concepts › Offline](../core-concepts/offline).

## Next steps

- [Frameworks › SvelteKit](../frameworks/sveltekit) — production wiring with hooks, typed cookies, and rate limiting.
- [Recipes › OPFS offline](../recipes/opfs-offline)
