# Popover

Canonical primitive: `popover`.

## Overview

<a id="overview"></a>

Popover is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `PopoverRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `anchor` | `PopoverAnchor` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `PopoverTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `PopoverPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `PopoverContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `title` | `PopoverTitle` | `heading` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `description` | `PopoverDescription` | `p` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `arrow` | `PopoverArrow` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `close` | `PopoverClose` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/popover: createPopoverController(props, environment?)`
- State: `PopoverState`
- Actions: `PopoverActions`
- Parts: `PopoverController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions
- react context: `PopoverProvider and usePopover(inputs); adapter context remains private`
- svelte context: `PopoverProvider; adapter context remains private to compound descendants`
- solid context: `PopoverProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `opening` (semantic)
- `open` (semantic)
- `closing` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — Popover semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Popover semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "ESCAPE" }` — Popover semantic transition event ESCAPE. Source: controller-or-native-contract.
- `{ type: "INTERACT_OUTSIDE" }` — Popover semantic transition event INTERACT_OUTSIDE. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after Popover requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical Popover contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical Popover contract. |
| `modal` | `boolean` | no | yes | `undefined → false` | Optional reactive modal input from the canonical Popover contract. |
| `placement` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive placement input from the canonical Popover contract. |
| `closeOnEscape` | `boolean` | no | yes | `undefined → false` | Optional reactive closeOnEscape input from the canonical Popover contract. |
| `closeOnInteractOutside` | `boolean` | no | yes | `undefined → false` | Optional reactive closeOnInteractOutside input from the canonical Popover contract. |

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

Use the compound root `Popover` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="popover"` on all styled parts; stable.
- `data-uifn-part="root | anchor | trigger | positioner | content | title | description | arrow | close"` on all styled parts; stable.
- `data-state="closed | opening | open | closing"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/popover` | `components/uifn/react/popover.ts` |
| svelte | `@uifn/components-svelte/popover` | `components/uifn/svelte/popover/index.ts` |
| solid | `@uifn/components-solid/popover` | `components/uifn/solid/popover.ts` |

#### React · package

```tsx
import * as React from 'react';
import { PopoverRoot } from "@uifn/components-react/popover";

export function PopoverExample() {
  return React.createElement(PopoverRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { PopoverRoot } from "./components/uifn/react/popover.js";

export function PopoverExample() {
  return React.createElement(PopoverRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { PopoverRoot } from "@uifn/components-svelte/popover";
</script>

<PopoverRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { PopoverRoot } from "./components/uifn/svelte/popover/index.js";
</script>

<PopoverRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { PopoverRoot } from "@uifn/components-solid/popover";

export function PopoverExample() {
  return createComponent(PopoverRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { PopoverRoot } from "./components/uifn/solid/popover.js";

export function PopoverExample() {
  return createComponent(PopoverRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add popover --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to Popover; implementation vectors own exact behavior.
