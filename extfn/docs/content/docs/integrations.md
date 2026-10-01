---
title: Integrations and Svelte
description: Keep domain contracts and host adapters with their owners.
---

`@extfn/svelte` provides page and content mounting adapters. It does not turn an extension page into SvelteKit. Shared UI that imports `$app/*` directly needs consumer-owned host interfaces for navigation, session, and other app state before it can run in an extension. The [consumer host guide](/docs/reference/consumer-host-abstraction) shows a migration pattern.

`@datafn/extfn` lives under `datafn/` and owns DataFn authority and proxy behavior in extension contexts. Keep any other domain-specific integration in its owning package tree, reusing its public contracts. The root ExtFn README names possible future SearchFn and FileFn integrations as examples; those examples are not shipped ExtFn packages here.

`@extfn/admin` currently declares an `unavailable` Super Console capability and an unavailable adapter. There is no supported ExtFn operator action surface in that package. Check the [admin source](https://github.com/21nCo/super-functions/blob/dev/extfn/admin/src/index.ts) before planning a console integration.
