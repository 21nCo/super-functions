---
title: Frameworks
description: Adapters that mount the authfn router on the HTTP framework you already use.
---

# Frameworks

The kernel router (`auth.router`) is framework-agnostic. To mount it, use one of the `@superfunctions/http-*` adapters that translates between authfn's `Request → Response` contract and your framework's native types.

| Framework | Adapter | Page |
| --- | --- | --- |
| Hono | `@superfunctions/http-hono` | [Hono](./hono) |
| Express | `@superfunctions/http-express` | [Express](./express) |
| Bun (native) | none — direct fetch | [Bun](./bun) |
| SvelteKit | `@superfunctions/http-sveltekit` | [SvelteKit](./sveltekit) |
| Next.js (App Router) | `@superfunctions/http-next` | [Next.js](./nextjs) |
| FastAPI | `superfunctions_fastapi` (Python) | [FastAPI](./fastapi) |
| Flask | `superfunctions_flask` (Python) | [Flask](./flask) |
| Starlette | `superfunctions_starlette` (Python) | [Starlette](./starlette) |
| Anything else | direct `Request → Response` | [Bring your own](./byo) |

## Pattern

Every adapter follows the same pattern:

```ts
import { toX } from '@superfunctions/http-x';
import { auth } from './auth.js';

app.useOrRouteOrMount('/auth', toX(auth.router));
```

The mounted prefix (`/auth` above) is your choice. `auth.router` does not include that prefix internally; the adapter strips it.

## Why an adapter at all?

Two things differ across frameworks:

- **Inbound `Request` construction.** Some frameworks parse the URL natively (Next.js, SvelteKit); others give you a raw socket and you build `new Request(...)` (Bun does this for free; Express needs help).
- **Response handling.** authfn returns a WHATWG `Response`. Express wants `res.send`. Hono wants the response object directly. The adapter mediates.

You don't need to think about either as long as you use a bundled adapter.
