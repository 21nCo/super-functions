---
title: Content and background handlers
description: Register multiple content modules and discover background handlers.
---

The config can declare several content scripts, each with its own ID, entry, match patterns, anchors, and style isolation. Anchor kinds include `selector`, `selector-list`, and `resolver`; each anchor carries its own `mountMode`, with values including `append`, `prepend`, `replace`, and `shadow`. The content helpers manage anchored mounting and reinjection.

Background handlers are separate modules discovered from `messageHandlersDir` and `portHandlersDir`. A message handler uses `defineBackgroundHandler({ namespace, method, handle })`; a port handler uses `defineBackgroundPortHandler({ channel, onMessage })`. The namespace/method pair and port channel must each be unique across discovered handlers.

`@extfn/svelte` supplies thin page and content mount functions. Components remain ordinary Svelte components; config owns DOM placement and isolation. The [multi-content source guide](/docs/reference/multi-content-and-background-handlers) includes complete examples and the [Svelte demo](https://github.com/21nCo/super-functions/tree/dev/extfn/examples/svelte-multi-content-demo) shows shadow and light DOM mounts.
