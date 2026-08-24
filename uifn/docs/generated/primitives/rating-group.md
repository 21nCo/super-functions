# RatingGroup

Canonical primitive: `rating-group`.

## Overview

<a id="overview"></a>

RatingGroup is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `RatingGroupRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `RatingGroupLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `RatingGroupControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `RatingGroupItem` | `button` | many | `number` | `value: number`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: number`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: number`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemIndicator` | `RatingGroupItemIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `RatingGroupHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `valueText` | `RatingGroupValueText` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/rating-group: createRatingGroupController(props, environment?)`
- State: `RatingGroupState`
- Actions: `RatingGroupActions`
- Parts: `RatingGroupController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `RatingGroupProvider and useRatingGroup(inputs); adapter context remains private`
- svelte context: `RatingGroupProvider; adapter context remains private to compound descendants`
- solid context: `RatingGroupProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `previewing` (semantic)
- `selected` (semantic)

Complete transition signatures:

- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — RatingGroup semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "HOVER" }` — RatingGroup semantic transition event HOVER. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — RatingGroup semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "CLEAR"; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — RatingGroup semantic transition event CLEAR. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — RatingGroup semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: number) => void` — Called after RatingGroup requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `number` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical RatingGroup contract. |
| `defaultValue` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical RatingGroup contract. |
| `count` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive count input from the canonical RatingGroup contract. |
| `allowHalf` | `boolean` | no | yes | `undefined → false` | Optional reactive allowHalf input from the canonical RatingGroup contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical RatingGroup contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical RatingGroup contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical RatingGroup contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical RatingGroup contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `range-gesture`. Native semantic basis: Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.7, 2.5.1, 2.5.7, 2.5.8, 4.1.2. Normative basis: native-html, wai-aria-apg-slider, wai-aria-apg-carousel. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `range-or-gesture-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`. Pointer/touch obligations: pointer-capture, cancel-and-lost-capture, touch-scroll-arbitration, keyboard-alternative. Focus obligations: focusable-operable-handle, multi-handle-order, visible-focus.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `scalar`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `RatingGroup` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="rating-group"` on all styled parts; stable.
- `data-uifn-part="root | label | control | item | itemIndicator | hiddenInput | valueText"` on all styled parts; stable.
- `data-state="idle | previewing | selected"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-readonly="true | false"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/rating-group` | `components/uifn/react/rating-group.ts` |
| svelte | `@uifn/components-svelte/rating-group` | `components/uifn/svelte/rating-group/index.ts` |
| solid | `@uifn/components-solid/rating-group` | `components/uifn/solid/rating-group.ts` |

#### React · package

```tsx
import * as React from 'react';
import { RatingGroupRoot } from "@uifn/components-react/rating-group";

export function RatingGroupExample() {
  return React.createElement(RatingGroupRoot, {"aria-label":"RatingGroup example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { RatingGroupRoot } from "./components/uifn/react/rating-group.js";

export function RatingGroupExample() {
  return React.createElement(RatingGroupRoot, {"aria-label":"RatingGroup example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { RatingGroupRoot } from "@uifn/components-svelte/rating-group";
</script>

<RatingGroupRoot aria-label="RatingGroup example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { RatingGroupRoot } from "./components/uifn/svelte/rating-group/index.js";
</script>

<RatingGroupRoot aria-label="RatingGroup example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { RatingGroupRoot } from "@uifn/components-solid/rating-group";

export function RatingGroupExample() {
  return createComponent(RatingGroupRoot, {"aria-label":"RatingGroup example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { RatingGroupRoot } from "./components/uifn/solid/rating-group.js";

export function RatingGroupExample() {
  return createComponent(RatingGroupRoot, {"aria-label":"RatingGroup example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add rating-group --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to RatingGroup; implementation vectors own exact behavior.
