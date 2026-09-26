---
title: Framework editors
description: Mount the shared controller in React, Svelte, Solid, or vanilla DOM.
---

# Framework editors

`@mdfn/dom` is the vanilla browser editor. `@mdfn/react`, `@mdfn/svelte`, and `@mdfn/solid` bind the same controller and command behavior to their frameworks. The `@mdfn/components-*` packages provide UIFn-based shells, toolbars, outline, diagnostics, and review controls.

Browser editing modules load after mount; framework packages expose server entry points for stable SSR containers. Keep the controller's Markdown and transactions as the public contract rather than persisting browser editor internals.

Run the [example applications](/docs/reference/examples) to see a complete workflow. Package details: [DOM](/docs/reference/dom), [React](/docs/reference/react), [Svelte](/docs/reference/svelte), [Solid](/docs/reference/solid), and [framework-neutral components](/docs/reference/components).
