# @uifn/core

Framework-agnostic behavior controllers for `uifn`.

`@uifn/core` is permanently unstyled. It owns state, actions, semantic part
contracts, and lifecycle only; it never ships visual CSS, design tokens, theme
defaults, or framework rendering. Use a headless adapter to render its
behavior, or a `@uifn/components-*` package when you want the maintained styled
compound layer.

Every current primitive is created through `createXController` and exposes the same lifecycle: immutable `state`/`snapshot`, readonly `actions` and named `parts`, reactive `update`, selector-aware `subscribe`, and idempotent `destroy`.

```ts
import { createSelectController, createUIFnEnvironment } from '@uifn/core'

const environment = createUIFnEnvironment({
  scopeId: 'settings-root',
  hydrationSeed: 'settings-request',
})
const select = createSelectController(
  { items: ['draft', 'published'], defaultValue: 'draft' },
  environment,
)

const unsubscribe = select.subscribe((state) => console.log(state.value))
select.actions.setValue('published')
unsubscribe()
select.destroy()
```

Share one resolved environment within each render or request root. Use child scopes for nested roots. Browser objects and optional capabilities are injected; core does not discover `document` or `window` during construction.

Public imports include the package root; the explicit `aria`, `utils`, `errors`, `controller`, `environment`, `parts`, and `primitives` entrypoints; and generated primitive subpaths such as `@uifn/core/primitives/select`. Private source-module paths remain unsupported. See [MIGRATION.md](./MIGRATION.md) for the breaking removal of generic machines, legacy constructors, and process-global ID helpers.

## Overlay contracts

AlertDialog, Dialog, Drawer, FloatingPanel, HoverCard, Popover, Tooltip, and Tour are distinct controllers backed by the reviewed `UIFN_OVERLAY_POLICIES` table. Core owns controlled state, event reasons, delay state, safety rules, and typed anatomy. It does not read the DOM or calculate focus, outside paths, scroll locks, portal placement, presence timing, or floating geometry.

The policies intentionally differ. AlertDialog prevents outside dismissal and requests least-destructive focus; Tooltip opens from hover or focus but not touch-hover and only describes its trigger; HoverCard permits pointer travel into its content; modal-capable Popover and FloatingPanel acquire modal behavior only when configured; Tour owns step navigation and target policy.

Renderers pass the controller, rendered elements, and explicit root to `createUIFnOverlayDomBinding` from `@uifn/dom`. Missing required names and unsafe AlertDialog configuration fail with `UIFN_ACCESSIBLE_NAME_MISSING` and `UIFN_ALERT_DIALOG_DISMISSAL`.

Status: `ga-candidate`.

Layer: `core`.
