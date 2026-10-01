---
title: ExtFn
description: Code-first browser extension development for Chromium and Firefox.
---

ExtFn provides code-first configuration, runtime helpers, a Vite build pipeline, a CLI, and a thin Svelte adapter for browser extensions. It supports Chromium MV3 and Firefox MV3 targets, background service workers, popup and options pages, Chromium side panels, and multiple anchored content modules.

The [getting-started guide](/docs/getting-started) walks through a config and the CLI. Read [runtime](/docs/runtime) for browser APIs and messaging, [content and background](/docs/content-and-background) for handler discovery and mounts, and [scan and package](/docs/scan-and-package) before distributing an extension.

ExtFn owns extension infrastructure. Domain logic stays in packages such as `@datafn/extfn`, which bridges DataFn authority into extension contexts. The optional `@extfn/admin` package currently declares an unavailable capability; it is not an operator UI. See [package integrations](/docs/integrations).
