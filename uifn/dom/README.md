# @uifn/dom

`@uifn/dom` is uifn's sole production browser-behavior layer. It is framework-neutral and root-scoped: every service receives an explicit `Document`, `ShadowRoot`, or `HTMLElement` and owns a deterministic teardown path.

React, Svelte, and Solid adapters bind these services to their lifecycle systems. They must not recreate focus traps, outside-click listeners, scroll locks, floating geometry, portals, or transition timers.

## Overlay binding

`createUIFnOverlayDomBinding` is the single executor for the eight core overlay policies. Adapters render controller parts, retain element refs, and bind them to an acquired platform:

```ts
import { createPopoverController } from '@uifn/core'
import { acquireUIFnDomPlatform, createUIFnOverlayDomBinding } from '@uifn/dom'

const controller = createPopoverController()
const lease = acquireUIFnDomPlatform({ root: trigger.ownerDocument })
const binding = createUIFnOverlayDomBinding({
  platform: lease.platform,
  controller,
  trigger,
  content,
  positioner,
  reference: trigger,
  portalNode: positioner,
})

// Adapter teardown
binding.destroy()
controller.destroy()
lease.release()
```

Pass `parent` when an overlay is portaled from another overlay. The binding registers document and Shadow DOM branches with the parent layer, focus scope, and modal isolation manager. Touch outside dismissal completes on pointer-up; interrupted presence, removed triggers, abrupt unmount, and nested modal locks all retain deterministic cleanup.

## Platform lifecycle

```ts
import { acquireUIFnDomPlatform } from '@uifn/dom'

const lease = acquireUIFnDomPlatform({ root: element.ownerDocument })
const layer = lease.platform.layers.register({
  element,
  onDismiss: () => close(),
})

// Framework cleanup / owner disposal
layer.destroy()
lease.release()
```

`acquireUIFnDomPlatform` shares one lazily-created service set per root and reference-counts consumers. `createUIFnDomPlatform` creates an explicitly owned platform instead. Destroy/release is idempotent; all listeners, observers, timers, animation frames, stateful DOM mutations, and service resources return to zero.

## Owned services

- root event delegation, observer lifecycles, input modality, focus-visible decisions, and native tabbable/focusable discovery;
- composed-path dismissable layers with top-eligible routing, branches, portals, Shadow DOM, touch, right-click, focus outside, Escape, and cancellation;
- nested focus scopes with trap/loop, autofocus cancellation, deterministic fallback, and focus restoration;
- modal accessibility isolation, inertness, pointer isolation, nested desktop/iOS scroll locking, compensation, and exact restoration;
- wrapped Floating UI positioning with offset, flip, shift, size, arrow, hide, inline, explicit boundaries, RTL, virtual anchors, and auto-update cleanup;
- root-aware portals, transition-aware presence, animation cancellation, interruption, force-mount, and reduced-motion handling;
- native form bridges, validation/reset/disabled-fieldset behavior, ordered live regions, deduplication, and stale-message rejection;
- scoped multi-pointer tracking for gesture bindings.

The public API exposes owned uifn contracts rather than dependency APIs. Floating UI and `tabbable` remain private implementation details; see `DEPENDENCIES.md` for their review record.

## Root and environment injection

```ts
import { createUIFnDomScope } from '@uifn/dom'

const scope = createUIFnDomScope({
  root: shadowRoot,
  environment: {
    locale: 'hi-IN',
    direction: 'rtl',
    reducedMotion: false,
    trace: (record) => diagnostics.push(record),
    error: (error) => report(error),
  },
})

scope.destroy()
```

Imports do not read browser globals. The same contracts work with same-origin iframe documents and open shadow roots. Optional capability failures use stable uifn errors rather than ambient `ReferenceError`s.

## Verification

```sh
npm run verify:uifn-dom-platform
npm --workspace @uifn/dom run typecheck
npm --workspace @uifn/dom run test
```

The phase gate builds and packs the public package, imports it in a clean consumer, rejects seeded framework-local behavior forks, and runs all `TV-DOM-001` through `TV-DOM-007` positive/negative vectors in Chromium, Firefox, and WebKit with screenshots and traces.
