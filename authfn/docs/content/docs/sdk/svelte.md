---
title: "@authfn/svelte"
description: Svelte stores, context, and SvelteKit-friendly patterns for displaying sign-in state and reacting to session changes.
---

# @authfn/svelte

`@authfn/svelte` provides Svelte 5 stores and context wrappers around `@authfn/client`. Use it to:

- Hydrate session state in `+layout.svelte` and reuse it across components.
- React to sign-in / sign-out without manual subscriptions.
- Drive UI from the live session / runtime state.

```bash
npm install @authfn/svelte @authfn/client
```

## Setup

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createAuthFnClient } from '@authfn/client';
  import {
    createAuthFnClientContext,
    createAuthFnSessionStore,
  } from '@authfn/svelte';

  const client = createAuthFnClient({ baseUrl: '/auth' });
  createAuthFnClientContext(client);
  const session = createAuthFnSessionStore({ client });
</script>

<svelte:window on:focus={() => session.refresh()} />

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

`createAuthFnSessionStore` returns a Svelte store with these fields:

```ts
interface AuthFnSessionStoreValue {
  loading: boolean;
  session: AuthFnSession | null;
  error: AuthFnError | null;
  refresh(): Promise<void>;
  signOut(input?: { allSessions?: boolean }): Promise<void>;
}
```

The store hydrates on mount and re-fetches on `refresh()`. After every successful mutation you call from the underlying client, call `session.refresh()` to keep the store in sync. (Future versions may auto-subscribe via `Server-Sent-Events`.)

## Reading the client from any component

```svelte
<script lang="ts">
  import { useAuthFnClient } from '@authfn/svelte';
  const client = useAuthFnClient();
</script>

<button on:click={async () => {
  await client.startSocialSignIn({ provider: 'google', returnTo: '/post-auth' });
}}>Sign in with Google</button>
```

`useAuthFnClient()` reads from the context that `createAuthFnClientContext` set up. Throws if no context is present.

## Server-side session reading (SvelteKit)

In SvelteKit, the Svelte SDK is for the *client* side. To read the session on the server (SSR pages, server load, form actions), authenticate the request through `auth.provider`:

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

The SvelteKit `+page.server.ts` value is serialized into the page; you can pair it with the client-side `session` store and pass `initialSession` to `createAuthFnSessionStore` if you want zero-flicker hydration:

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import { createAuthFnSessionStore } from '@authfn/svelte';
  let { data }: { data: PageData } = $props();
  const session = createAuthFnSessionStore({ client, initialSession: data.session });
</script>
```

## Multi-region client

For multi-region apps, instantiate a `AuthFnRegionalClient` and pass it as the client:

```ts
import { createAuthFnRegionalClient } from '@authfn/client';

const client = createAuthFnRegionalClient({
  defaultRegionId: 'us-east-1',
  resolveBaseUrl(regionId) {
    return regionId === 'eu-west-1' ? 'https://api.eu.example.com/auth' : 'https://api.us.example.com/auth';
  },
});
createAuthFnClientContext(client);
```

`useAuthFnClient` returns the regional client typed with all of its extra methods (`prepareEmailAuth`, `setCurrentRegionId`, etc.).

## Examples

The full account-settings example uses the Svelte SDK to:

- show the user's current sessions,
- list and revoke API keys,
- enroll/disable 2FA,
- delete the account.

See [Examples → account-settings](../examples/account-settings).

## Related

- [Quickstart → SvelteKit](../quickstart/sveltekit)
- [Frameworks → SvelteKit](../frameworks/sveltekit)
- [SDKs → Client](./client) — underlying TypeScript client.
