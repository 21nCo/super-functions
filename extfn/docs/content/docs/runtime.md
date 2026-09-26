---
title: Runtime and browser access
description: Use the Promise-first browser facade, messaging, events, and capabilities.
---

# Runtime and browser access

`@extfn/core` provides `createRuntime`, context and capability detection, browser access, RPC, events, ports, envelopes, and content primitives. Create a runtime in an extension entry point and pass the active target:

```ts
import { createRuntime } from "@extfn/core";

const runtime = createRuntime({
  globals: globalThis as never,
  rawBrowser: (globalThis as { browser?: unknown; chrome?: unknown }).browser
    ?? (globalThis as { browser?: unknown; chrome?: unknown }).chrome
    ?? {},
  target: "chromium-mv3",
});

const tabs = await runtime.browser.call("tabs.query", { active: true, currentWindow: true });
```

Use `runtime.browser.call(...)` for Promise-first calls, `runtime.browser.namespace(...)` for a specific API namespace, and `runtime.browser.raw` only when raw behavior is needed. Branch on `runtime.capabilities` for side panel, offscreen, and scripting support. The runtime does not grant browser permissions; declare and justify them in extension config and generated manifests.

Use `runtime.rpc`, `runtime.events`, and `runtime.ports` to communicate across extension contexts. Define background handlers in the service worker and avoid putting domain authority in a content script. The [source runtime exports](https://github.com/21nCo/super-functions/blob/dev/extfn/core/src/index.ts) and [messaging example](https://github.com/21nCo/super-functions/tree/dev/extfn/examples/vanilla-messaging-demo) show the concrete APIs.
