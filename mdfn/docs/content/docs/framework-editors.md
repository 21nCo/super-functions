---
title: Framework editors
description: Install and mount a controller in React, Svelte, Solid, or the vanilla DOM.
---

Choose the adapter for your existing application. All use the same `EditorController`; keep it stable across renders and destroy it when its owning view is permanently removed. Adapters release their DOM bindings but do not take ownership of the controller.

| Application | Install | Mounting example |
| --- | --- | --- |
| React | `npm install @mdfn/facade @mdfn/react` | [React](/docs/reference/react) |
| Svelte | `npm install @mdfn/facade @mdfn/svelte` | [Svelte](/docs/reference/svelte) |
| Solid | `npm install @mdfn/facade @mdfn/solid` | [Solid](/docs/reference/solid) |
| Vanilla DOM | `npm install @mdfn/facade @mdfn/dom` | [DOM](/docs/reference/dom) |

Framework `MdfnEditor` components support `visual`, `source`, `split`, `preview`, and `read-only` modes. `readOnly` also disables editing independently of mode. Use `ariaLabel` for an accessible name and `onLoadError` to display failed browser-module loads. These adapters mount editing surfaces; use `@mdfn/components-*` when you also want a toolbar and application shell.

Browser editing modules load after mount. Keep file and credential operations in your host application; `onFiles` receives selected files but does not upload them. Saving Markdown and sidecar state is a separate operation described in [server and storage](/docs/server-and-storage).
