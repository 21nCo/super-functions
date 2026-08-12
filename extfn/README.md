# extfn

`extfn` is the Superfunctions browser-extension framework family. It is code-first, Vite-powered, and keeps domain logic in owning packages instead of moving it into `extfn` core.

## Package map

- `extfn`
  - Core config types, runtime helpers, browser facade, envelopes, handlers, ports, and content-script primitives.
- `@extfn/vite`
  - Vite plugin and target-aware build/dev pipeline.
- `@extfn/cli`
  - Canonical `extfn` binary for `dev`, `build`, `scan`, and `package`.
- `@extfn/svelte`
  - Thin Svelte adapter for page and content mounts.
- `@datafn/extfn`
  - DataFn authority/proxy bridge for extension contexts.

## What ships in this repo

- Chromium MV3 and Firefox MV3 targets
- Background service workers
- Popup, options, and sidepanel page surfaces
- Multiple content-script modules with anchored mounts
- Background message handlers and background port handlers
- Promise-first browser facade plus raw browser access
- Strict-by-default extension scanning and deterministic packaging

## Code-first config

Every extension is described by one `extfn.config.ts` file that default-exports `defineExtension(...)`.

```ts
import { defineExtension } from "@extfn/core";

export default defineExtension({
  name: "My Extension",
  version: "0.1.0",
  targets: ["chromium-mv3", "firefox-mv3"],
  background: {
    serviceWorker: "./src/background/index.ts",
    messageHandlersDir: "./src/background/messages",
    portHandlersDir: "./src/background/ports",
  },
  popup: {
    entry: "./src/popup.html",
    title: "My Extension",
  },
  contentScripts: [
    {
      id: "highlights",
      entry: "./src/contents/highlight.ts",
      matches: ["https://*/*"],
      anchors: [
        {
          kind: "selector-list",
          selector: "[data-extfn-anchor]",
          mountMode: "append",
        },
      ],
    },
  ],
});
```

## Runtime usage

Use the root package exports for runtime setup and browser access.

```ts
import { createRuntime } from "@extfn/core";

const runtime = createRuntime({
  globals: globalThis as never,
  rawBrowser:
    (globalThis as { browser?: unknown; chrome?: unknown }).browser ??
    (globalThis as { browser?: unknown; chrome?: unknown }).chrome ??
    {},
  target: "chromium-mv3",
});

await runtime.browser.call("tabs.query", { active: true, currentWindow: true });
const rawTabs = runtime.browser.namespace("tabs");
```

Guidance:

- Prefer `runtime.browser.call(...)` and `runtime.browser.namespace(...)` for Promise-first access.
- Reach for `runtime.browser.raw` when you need a browser API surface that you do not want wrapped.
- Use `runtime.capabilities` instead of hard-coding browser assumptions. `sidepanel`, `offscreen`, and `scripting` are target-gated.

## CLI workflow

`extfn` is the mandatory workflow entrypoint.

```bash
npm exec extfn dev -- --config extfn.config.ts --target chromium-mv3 --no-open
npm exec extfn build -- --config extfn.config.ts
npm exec extfn scan -- --config extfn.config.ts
npm exec extfn package -- --config extfn.config.ts
```

More detail:

- [CLI workflow](./docs/cli.md)
- [Scan behavior and report model](./docs/scan.md)
- [Multi-content and background handler patterns](./docs/multi-content-and-background-handlers.md)
- [Consumer host abstraction and `$app/*` migration](./docs/consumer-host-abstraction.md)

## Package-owned integrations

`extfn` owns extension infrastructure. Package-owned integrations should own their domain logic in their own package trees.

Current pattern:

- `@datafn/extfn` owns DataFn authority and proxy behavior.

Recommended future pattern:

- `searchfn/extfn` should live under `searchfn/` and reuse existing public contracts such as `@searchfn/adapter-contracts`, `@searchfn/client`, and `@searchfn/datafn-provider`.
- `filefn/extfn` should live under `filefn/` and reuse `@filefn/client`, `@filefn/viewer`, `@superfunctions/files`, and `@superfunctions/storage`.

`extfn` should not become the place where search/file/storage contracts are redefined.

## Examples

- [vanilla-messaging-demo](./examples/vanilla-messaging-demo/README.md)
- [svelte-multi-content-demo](./examples/svelte-multi-content-demo/README.md)
- [svelte-datafn-demo](./examples/svelte-datafn-demo/README.md)

## Validation from repo root

```bash
npm exec extfn -- --help
npm run build -- --filter=vanilla-messaging-demo
npm run build -- --filter=svelte-multi-content-demo
npm run build -- --filter=svelte-datafn-demo
npm exec extfn scan -- --config extfn/examples/vanilla-messaging-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-multi-content-demo/extfn.config.ts
npm exec extfn scan -- --config extfn/examples/svelte-datafn-demo/extfn.config.ts
```
