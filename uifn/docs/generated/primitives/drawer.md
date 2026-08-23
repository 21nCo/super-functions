# Drawer

Canonical primitive: `drawer`.

## Overview

<a id="overview"></a>

Drawer is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `DrawerRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `DrawerTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `portal` | `DrawerPortal` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `backdrop` | `DrawerBackdrop` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `DrawerPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `DrawerContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `handle` | `DrawerHandle` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `title` | `DrawerTitle` | `heading` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `description` | `DrawerDescription` | `p` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `close` | `DrawerClose` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/drawer: createDrawerController(props, environment?)`
- State: `DrawerState`
- Actions: `DrawerActions`
- Parts: `DrawerController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions
- react context: `DrawerProvider and useDrawer(inputs); adapter context remains private`
- svelte context: `DrawerProvider; adapter context remains private to compound descendants`
- solid context: `DrawerProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `opening` (semantic)
- `open` (semantic)
- `dragging` (semantic)
- `closing` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — Drawer semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Drawer semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "ESCAPE" }` — Drawer semantic transition event ESCAPE. Source: controller-or-native-contract.
- `{ type: "DRAG_START" }` — Drawer semantic transition event DRAG_START. Source: controller-or-native-contract.
- `{ type: "DRAG_MOVE" }` — Drawer semantic transition event DRAG_MOVE. Source: controller-or-native-contract.
- `{ type: "DRAG_END" }` — Drawer semantic transition event DRAG_END. Source: controller-or-native-contract.
- `{ type: "DRAG_CANCEL" }` — Drawer semantic transition event DRAG_CANCEL. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after Drawer requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical Drawer contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical Drawer contract. |
| `side` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive side input from the canonical Drawer contract. |
| `modal` | `boolean` | no | yes | `undefined → true` | Optional reactive modal input from the canonical Drawer contract. |
| `dismissThreshold` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive dismissThreshold input from the canonical Drawer contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `open`. Uncontrolled defaults: `defaultOpen`. Change events: `OPEN_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `modal-overlay`. Native semantic basis: Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.

Accessible name required: yes; accepted sources: title-part, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.4.13, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 4.1.2. Normative basis: native-html, wai-aria-apg-dialog-modal, wai-aria-apg-tooltip. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `overlay-specific`; keys: `Tab`, `Shift+Tab`, `Escape`, `Enter`, `Space`. Pointer/touch obligations: trigger-activation, outside-interaction-by-declared-policy, touch-cancellation. Focus obligations: initial-focus, containment-when-modal, restore-focus, nested-scope-arbitration.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Drawer` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="drawer"` on all styled parts; stable.
- `data-uifn-part="root | trigger | portal | backdrop | positioner | content | handle | title | description | close"` on all styled parts; stable.
- `data-state="closed | opening | open | dragging | closing"` on stateful parts; stable semantic state.

CSS variables:

- `--uifn-component-accent` (shared)
- `--uifn-component-accent-contrast` (shared)
- `--uifn-component-bg` (shared)
- `--uifn-component-bg-muted` (shared)
- `--uifn-component-border` (shared)
- `--uifn-component-border-strong` (shared)
- `--uifn-component-danger` (shared)
- `--uifn-component-fg` (shared)
- `--uifn-component-fg-muted` (shared)
- `--uifn-component-radius-lg` (shared)
- `--uifn-component-radius-md` (shared)
- `--uifn-component-radius-sm` (shared)
- `--uifn-component-shadow` (shared)
- `--uifn-component-shadow-overlay` (shared)
- `--uifn-control-block-size` (shared)
- `--uifn-control-gap` (shared)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/drawer` | `components/uifn/react/drawer.ts` |
| svelte | `@uifn/components-svelte/drawer` | `components/uifn/svelte/drawer/DrawerBackdrop.svelte` |
| solid | `@uifn/components-solid/drawer` | `components/uifn/solid/drawer.ts` |

#### React · package

```tsx
import * as React from 'react';
import { DrawerRoot } from '@uifn/components-react/drawer';

export function DrawerExample() {
  return React.createElement(DrawerRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { DrawerRoot } from './components/uifn/react/drawer.js';

export function DrawerExample() {
  return React.createElement(DrawerRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { DrawerRoot } from '@uifn/components-svelte/drawer';
</script>

<DrawerRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { DrawerRoot } from './components/uifn/svelte/drawer/index.js';
</script>

<DrawerRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { DrawerRoot } from '@uifn/components-solid/drawer';

export function DrawerExample() {
  return createComponent(DrawerRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { DrawerRoot } from './components/uifn/solid/drawer.js';

export function DrawerExample() {
  return createComponent(DrawerRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add drawer --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to Drawer; implementation vectors own exact behavior.
