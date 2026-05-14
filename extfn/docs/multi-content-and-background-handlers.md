# Multi-content and Background Handlers

This guide documents the repository pattern used by the example extensions for multiple content modules and modular background handlers.

## Background layout

Use one service worker plus directories for handlers.

```ts
import { defineExtension } from "extfn";

export default defineExtension({
  name: "Handler Demo",
  version: "0.1.0",
  targets: ["chromium-mv3", "firefox-mv3"],
  background: {
    serviceWorker: "./src/background/index.ts",
    messageHandlersDir: "./src/background/messages",
    portHandlersDir: "./src/background/ports",
  },
});
```

Message handler:

```ts
import { defineBackgroundHandler } from "extfn";

export default defineBackgroundHandler({
  namespace: "demo",
  method: "ping",
  handle: async () => ({ ok: true }),
});
```

Port handler:

```ts
import { defineBackgroundPortHandler } from "extfn";

export default defineBackgroundPortHandler({
  channel: "demo-stream",
  async onMessage(_runtime, payload, _envelope, port) {
    await port.send({ echo: payload });
  },
});
```

Notes:

- `namespace + method` must be unique across discovered message handlers.
- `channel` must be unique across discovered port handlers.
- Keep domain logic in the owning package when possible; the handler file should be the extension integration edge, not the domain implementation itself.

## Multiple content modules

You can declare multiple content scripts in one config.

```ts
contentScripts: [
  {
    id: "twitter-anchor",
    entry: "./src/contents/twitter.ts",
    matches: ["https://twitter.com/*"],
    anchors: [
      {
        kind: "selector-list",
        selector: "[data-extfn-twitter-anchor]",
        mountMode: "shadow",
      },
    ],
    styleIsolation: "shadow-root",
    normalizeRootStyles: true,
  },
  {
    id: "youtube-anchor",
    entry: "./src/contents/youtube.ts",
    matches: ["https://www.youtube.com/*"],
    anchors: [
      {
        kind: "selector-list",
        selector: "[data-extfn-youtube-anchor]",
        mountMode: "append",
      },
    ],
  },
];
```

Anchor choices:

- `selector`
- `selector-list`
- `resolver`

Mount modes:

- `append`
- `prepend`
- `replace`
- `shadow`

## Svelte content mounts

The Svelte adapter stays thin. Mount from the content entrypoint and keep DOM policy in your extension config.

```ts
import { mountSvelteContent } from "@extfn/svelte";
import Badge from "./Badge.svelte";

for (const anchor of document.querySelectorAll("[data-extfn-anchor]")) {
  const host = document.createElement("div");
  anchor.append(host);
  mountSvelteContent(Badge, host, {
    props: {
      label: "Mounted from extfn content",
    },
  });
}
```

The Svelte multi-content example in this repo demonstrates both:

- shadow-root isolation for one content module
- light-DOM append mounts for another content module

## Browser facade versus raw browser access

For content and page code:

- use `createRuntime()` to get `rpc`, `events`, `ports`, `capabilities`, and `browser`
- use `runtime.browser.call(...)` for Promise-first access
- use `runtime.browser.raw` when you need the raw browser global directly

## Guidance for package-owned integrations

If a package such as `datafn`, `searchfn`, or `filefn` needs extension integration:

- keep the integration package under the owning package tree
- keep domain contracts in the owning package or shared package
- expose only extension-facing glue here

Examples:

- `@datafn/extfn` owns background authority and proxy client wiring
- future `searchfn/extfn` should reuse `@searchfn/adapter-contracts` and `@searchfn/datafn-provider`
- future `filefn/extfn` should reuse `@filefn/client`, `@filefn/viewer`, `@superfunctions/files`, and `@superfunctions/storage`
