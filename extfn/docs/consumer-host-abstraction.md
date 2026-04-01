# Consumer Host Abstraction

This guide exists for consumers such as `nucleus` that already have shared UI packages tied to SvelteKit runtime imports like `$app/navigation`, `$app/stores`, or `$app/environment`.

## The problem

A shared package that imports `$app/*` directly is no longer truly shared. It can only run inside a SvelteKit app shell.

That becomes a blocker when the same UI needs to run in:

- a SvelteKit web app
- an `extfn` popup
- an `extfn` options page
- an `extfn` sidepanel
- an `extfn` content mount

## Recommended shape

Keep host-specific APIs in the consumer repository, not in `extfn`.

Shared UI package:

```ts
export interface NavigationHost {
  goto(url: string): Promise<void>;
  currentPath(): string;
}

export interface SessionHost {
  getSession(): Promise<{ userId: string | null }>;
}

export interface ConsumerHost {
  navigation: NavigationHost;
  session: SessionHost;
}
```

Shared component:

```ts
export interface SharedPanelProps {
  host: ConsumerHost;
}
```

SvelteKit adapter in the consumer repo:

```ts
import { goto } from "$app/navigation";
import { get } from "svelte/store";
import { page } from "$app/stores";

export const svelteKitHost = {
  navigation: {
    async goto(url: string) {
      await goto(url);
    },
    currentPath() {
      return get(page).url.pathname;
    },
  },
  session: {
    async getSession() {
      return { userId: "from-web-app" };
    },
  },
};
```

Extension adapter in the consumer repo:

```ts
import { createRuntime } from "@superfunctions/extfn";

const runtime = createRuntime({
  globals: globalThis as never,
  rawBrowser:
    (globalThis as { browser?: unknown; chrome?: unknown }).browser ??
    (globalThis as { browser?: unknown; chrome?: unknown }).chrome ??
    {},
  target: "chromium-mv3",
});

export const extfnHost = {
  navigation: {
    async goto(url: string) {
      await runtime.browser.call("tabs.create", { url });
    },
    currentPath() {
      return runtime.address.context;
    },
  },
  session: {
    async getSession() {
      return { userId: null };
    },
  },
};
```

## Migration plan away from `$app/*`

1. Inventory every `$app/*` import in shared packages.
2. Move each runtime-specific dependency behind a consumer-owned host interface.
3. Keep those interfaces small and capability-oriented.
4. Inject the host into shared components from the app entrypoint or page mount.
5. Make extension entrypoints build their own host adapters using `extfn` runtime and raw browser APIs.

## What belongs where

Put these in the consumer repo:

- navigation semantics
- session/user loading
- router state
- feature-flag resolution
- environment-specific page state

Put these in `extfn`-based extension entrypoints:

- browser tab/window operations
- messaging to background handlers
- extension storage access
- content-script mount coordination

Do not put these in `extfn`:

- fake SvelteKit runtime shims
- `$app/*` compatibility layers
- consumer-specific router/session abstractions

## Why this works for `nucleus`

`nucleus` can keep a single shared component package as long as the package stops importing `$app/*` directly and accepts a consumer-owned host adapter instead.

That lets the same shared component tree run in:

- SvelteKit pages with a SvelteKit host adapter
- `extfn` pages with an extension host adapter

without requiring changes in `extfn` itself.

## Related guidance

- `extfn` runtime APIs are documented in [../README.md](../README.md)
- CLI workflow is documented in [./cli.md](./cli.md)
- DataFn integration is documented in [../../datafn/extfn/README.md](../../datafn/extfn/README.md)
