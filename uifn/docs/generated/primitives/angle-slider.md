# AngleSlider

Canonical primitive: `angle-slider`.

## Overview

<a id="overview"></a>

AngleSlider is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `AngleSliderRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `track` | `AngleSliderTrack` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `thumb` | `AngleSliderThumb` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `valueText` | `AngleSliderValueText` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `AngleSliderHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/angle-slider: createAngleSliderController(props, environment?)`
- State: `AngleSliderState`
- Actions: `AngleSliderActions`
- Parts: `AngleSliderController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `AngleSliderProvider and useAngleSlider(inputs); adapter context remains private`
- svelte context: `AngleSliderProvider; adapter context remains private to compound descendants`
- solid context: `AngleSliderProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `dragging` (semantic)

Complete transition signatures:

- `{ type: "POINTER_START"; pointerId?: number; x?: number; y?: number }` — AngleSlider semantic transition event POINTER_START. Source: controller-or-native-contract.
- `{ type: "POINTER_MOVE"; pointerId?: number; x?: number; y?: number }` — AngleSlider semantic transition event POINTER_MOVE. Source: controller-or-native-contract.
- `{ type: "POINTER_END"; pointerId?: number; x?: number; y?: number }` — AngleSlider semantic transition event POINTER_END. Source: controller-or-native-contract.
- `{ type: "KEY_STEP"; key: string }` — AngleSlider semantic transition event KEY_STEP. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: number }` — AngleSlider semantic transition event SET_VALUE. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: number) => void` — Called after AngleSlider requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `number` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical AngleSlider contract. |
| `defaultValue` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical AngleSlider contract. |
| `min` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical AngleSlider contract. |
| `max` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical AngleSlider contract. |
| `step` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive step input from the canonical AngleSlider contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical AngleSlider contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical AngleSlider contract. |

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

Use the compound root `AngleSlider` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="angle-slider"` on all styled parts; stable.
- `data-uifn-part="root | track | thumb | valueText | hiddenInput"` on all styled parts; stable.
- `data-state="idle | dragging"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/angle-slider` | `components/uifn/react/angle-slider.ts` |
| svelte | `@uifn/components-svelte/angle-slider` | `components/uifn/svelte/angle-slider/AngleSliderHiddenInput.svelte` |
| solid | `@uifn/components-solid/angle-slider` | `components/uifn/solid/angle-slider.ts` |

#### React · package

```tsx
import * as React from 'react';
import { AngleSliderRoot } from "@uifn/components-react/angle-slider";

export function AngleSliderExample() {
  return React.createElement(AngleSliderRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { AngleSliderRoot } from "./components/uifn/react/angle-slider.js";

export function AngleSliderExample() {
  return React.createElement(AngleSliderRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { AngleSliderRoot } from "@uifn/components-svelte/angle-slider";
</script>

<AngleSliderRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { AngleSliderRoot } from "./components/uifn/svelte/angle-slider/index.js";
</script>

<AngleSliderRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { AngleSliderRoot } from "@uifn/components-solid/angle-slider";

export function AngleSliderExample() {
  return createComponent(AngleSliderRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { AngleSliderRoot } from "./components/uifn/solid/angle-slider.js";

export function AngleSliderExample() {
  return createComponent(AngleSliderRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add angle-slider --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to AngleSlider; implementation vectors own exact behavior.
