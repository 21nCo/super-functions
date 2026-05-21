---
title: Bun
description: Use Bun's native HTTP server — authfn is WHATWG-native, no adapter needed.
---

# Bun

Bun's `Bun.serve` accepts a `(Request) => Promise<Response>` handler — exactly what authfn's router exposes. No adapter required.

```ts
import { auth } from './auth.ts';

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/openapi.json') {
      return Response.json(auth.openApi?.() ?? {});
    }

    if (url.pathname.startsWith('/auth')) {
      return auth.router.fetch(stripPrefix(request, '/auth'));
    }

    return new Response('not found', { status: 404 });
  },
});

function stripPrefix(request: Request, prefix: string): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice(prefix.length) || '/';
  return new Request(url, request);
}
```

## Hot reload

`bun --hot server.ts` reloads the module on changes. The `auth` instance is module-scoped, so it picks up changes correctly. Use `--watch` instead if you want full process restart.

## Bun + SQLite

`bun:sqlite` gives you a file-backed database with zero config — combined with authfn this is the smallest possible self-hosted auth deployment:

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const db = drizzle(new Database('authfn.db'));
const auth = createAuthFn({ database: drizzleAdapter(db), /* ... */ });
```

## Bun on Cloudflare-compatible runtimes

Bun deployments on Workers or Cloudflare-compatible platforms work out of the box; pair with an edge-compatible database (D1, Hyperdrive, etc.).
