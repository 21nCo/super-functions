---
title: SvelteKit
description: Mount authfn as a SvelteKit endpoint and read sessions from server load functions, hooks, and form actions.
---

# SvelteKit

```bash
npm install @superfunctions/http-sveltekit
```

## The catch-all endpoint

```ts
// src/routes/auth/[...path]/+server.ts
import { toSvelteKit } from '@superfunctions/http-sveltekit';
import { auth } from '$lib/server/auth';

export const GET = toSvelteKit(auth.router);
export const POST = toSvelteKit(auth.router);
export const PUT = toSvelteKit(auth.router);
export const DELETE = toSvelteKit(auth.router);
```

## Reading sessions in `+page.server.ts`

```ts
// src/hooks.server.ts
import { auth } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.session = await auth.provider.authenticate(event.request);
  return resolve(event);
};
```

```ts
// src/routes/dashboard/+page.server.ts
export const load = async ({ locals }) => {
  if (!locals.session) throw error(401);
  return { user: locals.session.subject };
};
```

Type the `App.Locals`:

```ts
// src/app.d.ts
import type { AuthFnSession } from '@authfn/core';
declare global {
  namespace App {
    interface Locals {
      session: AuthFnSession | null;
    }
  }
}
export {};
```

## Form actions and CSRF

SvelteKit's form actions submit via POST — and the authfn router enforces CSRF on POST. The cleanest pattern is:

1. Use the `@authfn/client` browser SDK from `+page.svelte` for sign-in / sign-up / OTP / OAuth — these flows need the CSRF cookie anyway.
2. Use server-side `auth.router.fetch` from `+page.server.ts` only for actions that don't have a CSRF context (e.g. an admin tool calling on behalf of a user).

For a form action that *does* run on cookie-authenticated users, redirect them through a normal POST to `/auth/...` rather than rebuilding the request server-side.

## Region-aware base URL

For multi-region deployments, configure your `runtime.resolve` to derive the base URL from `event.url`:

```ts
// src/lib/server/auth.ts
createAuthFn({
  // ...
  runtime: {
    resolve(request) {
      const url = new URL(request.url);
      return { issuer: url.origin, baseUrl: url.origin, regionId: regionForHost(url.hostname) };
    },
  },
});
```

## Edge deployments

SvelteKit on Cloudflare Pages / Vercel Edge / Netlify Edge works as long as your DB adapter is edge-compatible. See [Adapters → Database → Drizzle](../adapters/database/drizzle).

## Related

- [Quickstart → SvelteKit](../quickstart/sveltekit)
- [SDKs → Svelte](../sdk/svelte)
