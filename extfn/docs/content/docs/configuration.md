---
title: Configuration
description: Choose targets, background handlers, page surfaces, and content mounts.
---

`defineExtension` takes a name, version, target list, and background definition. The resolver requires a nonempty name and version and a `background.serviceWorker`. Supported targets are `chromium-mv3` and `firefox-mv3`. Add `popup`, `options`, or `sidepanel` surfaces with entry files, and declare `contentScripts` with stable IDs, entries, URL matches, and anchors.

An example with modular background handlers:

```ts
import { defineExtension } from "@extfn/core";

export default defineExtension({
  name: "Example Extension",
  version: "0.1.0",
  targets: ["chromium-mv3", "firefox-mv3"],
  background: {
    serviceWorker: "./src/background/index.ts",
    messageHandlersDir: "./src/background/messages",
    portHandlersDir: "./src/background/ports",
  },
  contentScripts: [{
    id: "panel",
    entry: "./src/contents/panel.ts",
    matches: ["https://example.com/*"],
    anchors: [{ kind: "selector-list", selector: "[data-panel]", mountMode: "append" }],
  }],
});
```

Side-panel support is target-gated; do not assume Firefox supports the Chromium side-panel surface. Resolver and manifest behavior live in the [config source](https://github.com/21nCo/super-functions/blob/dev/extfn/core/src/config.ts) and [manifest builder](https://github.com/21nCo/super-functions/blob/dev/extfn/vite/src/manifest/buildManifest.ts). Review generated manifests before requesting browser permissions.
