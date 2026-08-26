# FloatingPanel

Canonical primitive: `floating-panel`.

## Overview

<a id="overview"></a>

FloatingPanel is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `FloatingPanelRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `FloatingPanelTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `FloatingPanelPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `FloatingPanelContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `header` | `FloatingPanelHeader` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `title` | `FloatingPanelTitle` | `heading` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `description` | `FloatingPanelDescription` | `p` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `dragHandle` | `FloatingPanelDragHandle` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `resizeHandle` | `FloatingPanelResizeHandle` | `div` | many | `'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west'` | `value: 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `close` | `FloatingPanelClose` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/floating-panel: createFloatingPanelController(props, environment?)`
- State: `FloatingPanelState`
- Actions: `FloatingPanelActions`
- Parts: `FloatingPanelController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions
- react context: `FloatingPanelProvider and useFloatingPanel(inputs); adapter context remains private`
- svelte context: `FloatingPanelProvider; adapter context remains private to compound descendants`
- solid context: `FloatingPanelProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `open` (semantic)
- `dragging` (semantic)
- `resizing` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — FloatingPanel semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — FloatingPanel semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "DRAG_START" }` — FloatingPanel semantic transition event DRAG_START. Source: controller-or-native-contract.
- `{ type: "DRAG_MOVE" }` — FloatingPanel semantic transition event DRAG_MOVE. Source: controller-or-native-contract.
- `{ type: "DRAG_END" }` — FloatingPanel semantic transition event DRAG_END. Source: controller-or-native-contract.
- `{ type: "RESIZE_START" }` — FloatingPanel semantic transition event RESIZE_START. Source: controller-or-native-contract.
- `{ type: "RESIZE_MOVE" }` — FloatingPanel semantic transition event RESIZE_MOVE. Source: controller-or-native-contract.
- `{ type: "RESIZE_END" }` — FloatingPanel semantic transition event RESIZE_END. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after FloatingPanel requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical FloatingPanel contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical FloatingPanel contract. |
| `modal` | `boolean` | no | yes | `undefined → false` | Optional reactive modal input from the canonical FloatingPanel contract. |
| `placement` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive placement input from the canonical FloatingPanel contract. |
| `draggable` | `boolean` | no | yes | `undefined → false` | Optional reactive draggable input from the canonical FloatingPanel contract. |
| `resizable` | `boolean` | no | yes | `undefined → false` | Optional reactive resizable input from the canonical FloatingPanel contract. |

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `FloatingPanel` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="floating-panel"` on all styled parts; stable.
- `data-uifn-part="root | trigger | positioner | content | header | title | description | dragHandle | resizeHandle | close"` on all styled parts; stable.
- `data-state="closed | open | dragging | resizing"` on stateful parts; stable semantic state.

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
- `--uifn-control-block-size` (shared)
- `--uifn-control-gap` (shared)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/floating-panel` | `components/uifn/react/floating-panel.ts` |
| svelte | `@uifn/components-svelte/floating-panel` | `components/uifn/svelte/floating-panel/FloatingPanelClose.svelte` |
| solid | `@uifn/components-solid/floating-panel` | `components/uifn/solid/floating-panel.ts` |

#### React · package

```tsx
import * as React from 'react';
import { FloatingPanelRoot } from "@uifn/components-react/floating-panel";

export function FloatingPanelExample() {
  return React.createElement(FloatingPanelRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { FloatingPanelRoot } from "./components/uifn/react/floating-panel.js";

export function FloatingPanelExample() {
  return React.createElement(FloatingPanelRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { FloatingPanelRoot } from "@uifn/components-svelte/floating-panel";
</script>

<FloatingPanelRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { FloatingPanelRoot } from "./components/uifn/svelte/floating-panel/index.js";
</script>

<FloatingPanelRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { FloatingPanelRoot } from "@uifn/components-solid/floating-panel";

export function FloatingPanelExample() {
  return createComponent(FloatingPanelRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { FloatingPanelRoot } from "./components/uifn/solid/floating-panel.js";

export function FloatingPanelExample() {
  return createComponent(FloatingPanelRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add floating-panel --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to FloatingPanel; implementation vectors own exact behavior.
