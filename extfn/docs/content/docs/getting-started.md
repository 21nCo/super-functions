---
title: Getting started
description: Define an extension and run the canonical ExtFn workflow.
---

Create `extfn.config.ts` and default-export `defineExtension(...)`. Configure one or more targets and a background service worker. Add page surfaces and content scripts as needed:

```ts
import { defineExtension } from "@extfn/core";

export default defineExtension({
  name: "Example Extension",
  version: "0.1.0",
  targets: ["chromium-mv3", "firefox-mv3"],
  background: { serviceWorker: "./src/background/index.ts" },
  popup: { entry: "./src/popup.html", title: "Example Extension" },
});
```

The CLI is the workflow entry point. Choose one target for `dev` when the config has multiple targets. Production `build` handles all configured targets by default.

```sh
npm exec extfn dev -- --config extfn.config.ts --target chromium-mv3 --no-open
npm exec extfn build -- --config extfn.config.ts
npm exec extfn scan -- --config extfn.config.ts
npm exec extfn package -- --config extfn.config.ts
```

Development emits an unpacked extension at `dist/<target>-dev`; production builds emit `dist/<target>`. `package` builds if needed, scans by default, and emits `.zip` for Chromium or `.xpi` for Firefox. Loading an unpacked extension into Firefox remains manual even when `--open` launches `about:debugging`. See [CLI workflow](/docs/cli) and the [vanilla example](https://github.com/21nCo/super-functions/tree/dev/extfn/examples/vanilla-messaging-demo).
