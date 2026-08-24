# HoverCard

Canonical primitive: `hover-card`.

## Overview

<a id="overview"></a>

HoverCard is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `HoverCardRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `HoverCardTrigger` | `a` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `HoverCardPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `HoverCardContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `arrow` | `HoverCardArrow` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/hover-card: createHoverCardController(props, environment?)`
- State: `HoverCardState`
- Actions: `HoverCardActions`
- Parts: `HoverCardController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions
- react context: `HoverCardProvider and useHoverCard(inputs); adapter context remains private`
- svelte context: `HoverCardProvider; adapter context remains private to compound descendants`
- solid context: `HoverCardProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `opening-delay` (semantic)
- `open` (semantic)
- `closing-delay` (semantic)

Complete transition signatures:

- `{ type: "POINTER_ENTER" }` — HoverCard semantic transition event POINTER_ENTER. Source: controller-or-native-contract.
- `{ type: "POINTER_LEAVE" }` — HoverCard semantic transition event POINTER_LEAVE. Source: controller-or-native-contract.
- `{ type: "FOCUS" }` — HoverCard semantic transition event FOCUS. Source: controller-or-native-contract.
- `{ type: "BLUR" }` — HoverCard semantic transition event BLUR. Source: controller-or-native-contract.
- `{ type: "OPEN"; reason?: string }` — HoverCard semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — HoverCard semantic transition event CLOSE. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after HoverCard requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical HoverCard contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical HoverCard contract. |
| `openDelay` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive openDelay input from the canonical HoverCard contract. |
| `closeDelay` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive closeDelay input from the canonical HoverCard contract. |
| `placement` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive placement input from the canonical HoverCard contract. |

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

Use the compound root `HoverCard` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="hover-card"` on all styled parts; stable.
- `data-uifn-part="root | trigger | positioner | content | arrow"` on all styled parts; stable.
- `data-state="closed | opening-delay | open | closing-delay"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/hover-card` | `components/uifn/react/hover-card.ts` |
| svelte | `@uifn/components-svelte/hover-card` | `components/uifn/svelte/hover-card/HoverCardArrow.svelte` |
| solid | `@uifn/components-solid/hover-card` | `components/uifn/solid/hover-card.ts` |

#### React · package

```tsx
import * as React from 'react';
import { HoverCardRoot } from "@uifn/components-react/hover-card";

export function HoverCardExample() {
  return React.createElement(HoverCardRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { HoverCardRoot } from "./components/uifn/react/hover-card.js";

export function HoverCardExample() {
  return React.createElement(HoverCardRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { HoverCardRoot } from "@uifn/components-svelte/hover-card";
</script>

<HoverCardRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { HoverCardRoot } from "./components/uifn/svelte/hover-card/index.js";
</script>

<HoverCardRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { HoverCardRoot } from "@uifn/components-solid/hover-card";

export function HoverCardExample() {
  return createComponent(HoverCardRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { HoverCardRoot } from "./components/uifn/solid/hover-card.js";

export function HoverCardExample() {
  return createComponent(HoverCardRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add hover-card --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to HoverCard; implementation vectors own exact behavior.
