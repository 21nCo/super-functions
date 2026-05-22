---
title: SvelteKit
description: Mount authfn as a SvelteKit endpoint, hydrate a reactive session store, and use authfn from server load functions and form actions.
---

# SvelteKit quickstart

This walkthrough builds an end-to-end auth flow inside a SvelteKit app: a server-side authfn runtime, a hydration-safe session store, and a typed client both in `+page.svelte` and `+page.server.ts`.

## 1. Install

```bash
npm install @authfn/core @authfn/client @authfn/svelte @superfunctions/http-sveltekit
```

## 2. Create the runtime

```ts
// src/lib/server/auth.ts
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import {
  authFnEmailOtpPlugin,
  authFnPasswordPlugin,
  authFnSocialOAuthPlugin,
  createAuthFn,
} from "@authfn/core";
import { env } from "$env/dynamic/private";

export const auth = createAuthFn({
  database: memoryAdapter({ debug: false }),
  namespace: "authfn",
  openApi: { title: "AuthFn API", version: "1.0.0" },
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({
      delivery: {
        async send({ email, code, purpose }) {
          console.log(`[OTP] ${purpose} → ${email}: ${code}`);
          return { sent: true };
        },
      },
    }),
    authFnSocialOAuthPlugin({
      providers: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          allowlistedReturnTo: ["/post-auth"],
        },
      },
    }),
  ],
});
```

## 3. Mount the catch-all route

```ts
// src/routes/auth/[...path]/+server.ts
import { auth } from "$lib/server/auth";
import { toSvelteKit } from "@superfunctions/http-sveltekit";

export const GET = toSvelteKit(auth.router);
export const POST = toSvelteKit(auth.router);
export const PUT = toSvelteKit(auth.router);
export const DELETE = toSvelteKit(auth.router);
```

## 4. Wire the client and Svelte store

```ts
// src/lib/client.ts
import { createAuthFnClient } from "@authfn/client";
export const client = createAuthFnClient({ baseUrl: "/auth" });
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    createAuthFnClientContext,
    createAuthFnSessionStore,
  } from "@authfn/svelte";
  import { client } from "$lib/client";

  createAuthFnClientContext(client);
  const session = createAuthFnSessionStore({ client });

  onMount(() => session.refresh());
</script>

<header>
  {#if $session.session}
    <span>{$session.session.primaryEmail}</span>
    <button on:click={() => session.signOut()}>Sign out</button>
  {:else}
    <a href="/sign-in">Sign in</a>
  {/if}
</header>

<slot />
```

## 5. Read the session on the server

```ts
// src/hooks.server.ts
import { auth } from "$lib/server/auth";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.session = await auth.provider.authenticate(event.request);
  return resolve(event);
};
```

```ts
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw error(401, "Sign in to view the dashboard");
  }
  return { user: locals.session.subject };
};
```

## 6. Reference

The authfn examples ship a working SvelteKit + Postgres + Drizzle stack you can clone:

- [`authfn/examples/password-sessions`](../examples/password-sessions)
- [`authfn/examples/social-oauth`](../examples/social-oauth)
- [`authfn/examples/multi-region-routing`](../examples/multi-region-routing)

## Next steps

- [SDKs → Svelte](../sdk/svelte) for full reference on stores, context, and SSR considerations.
- [Frameworks → SvelteKit](../frameworks/sveltekit) for deeper integration patterns (CSRF on form actions, region-aware base URLs, edge deployment).
- [Recipes](../recipes) for ready-to-paste flows: account deletion, email verification, adding 2FA, magic link.
