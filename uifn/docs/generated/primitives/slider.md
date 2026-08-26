# Slider

Canonical primitive: `slider`.

## Overview

<a id="overview"></a>

Slider is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SliderRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `SliderLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `SliderControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `track` | `SliderTrack` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `range` | `SliderRange` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `thumb` | `SliderThumb` | `div` | many | `number` | `value: number`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: number`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: number`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `valueText` | `SliderValueText` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `SliderHiddenInput` | `input` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/slider: createSliderController(props, environment?)`
- State: `SliderState`
- Actions: `SliderActions`
- Parts: `SliderController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `SliderProvider and useSlider(inputs); adapter context remains private`
- svelte context: `SliderProvider; adapter context remains private to compound descendants`
- solid context: `SliderProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `dragging` (semantic)
- `focused` (semantic)

Complete transition signatures:

- `{ type: "POINTER_START"; pointerId?: number; x?: number; y?: number }` — Slider semantic transition event POINTER_START. Source: controller-or-native-contract.
- `{ type: "POINTER_MOVE"; pointerId?: number; x?: number; y?: number }` — Slider semantic transition event POINTER_MOVE. Source: controller-or-native-contract.
- `{ type: "POINTER_END"; pointerId?: number; x?: number; y?: number }` — Slider semantic transition event POINTER_END. Source: controller-or-native-contract.
- `{ type: "POINTER_CANCEL"; pointerId?: number }` — Slider semantic transition event POINTER_CANCEL. Source: controller-or-native-contract.
- `{ type: "KEY_STEP"; key: string }` — Slider semantic transition event KEY_STEP. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: number[] }` — Slider semantic transition event SET_VALUE. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — Slider semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: number[]) => void` — Called after Slider requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `number[]` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Slider contract. |
| `defaultValue` | `number[]` | no | yes | `undefined → []` | Optional reactive defaultValue input from the canonical Slider contract. |
| `min` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical Slider contract. |
| `max` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical Slider contract. |
| `step` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive step input from the canonical Slider contract. |
| `minStepsBetweenThumbs` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive minStepsBetweenThumbs input from the canonical Slider contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Slider contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical Slider contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical Slider contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Slider contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical Slider contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `multiple`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `range-gesture`. Native semantic basis: Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.7, 2.5.1, 2.5.7, 2.5.8, 4.1.2. Normative basis: native-html, wai-aria-apg-slider, wai-aria-apg-carousel. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `range-or-gesture-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`. Pointer/touch obligations: pointer-capture, cancel-and-lost-capture, touch-scroll-arbitration, keyboard-alternative. Focus obligations: focusable-operable-handle, multi-handle-order, visible-focus.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `multiple`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Slider` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="slider"` on all styled parts; stable.
- `data-uifn-part="root | label | control | track | range | thumb | valueText | hiddenInput"` on all styled parts; stable.
- `data-state="idle | dragging | focused"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.
- `data-dir="string"` on parts whose semantics depend on this input; stable semantic state.
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
| react | `@uifn/components-react/slider` | `components/uifn/react/slider.ts` |
| svelte | `@uifn/components-svelte/slider` | `components/uifn/svelte/slider/index.ts` |
| solid | `@uifn/components-solid/slider` | `components/uifn/solid/slider.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SliderRoot } from "@uifn/components-react/slider";

export function SliderExample() {
  return React.createElement(SliderRoot, {"aria-label":"Slider example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SliderRoot } from "./components/uifn/react/slider.js";

export function SliderExample() {
  return React.createElement(SliderRoot, {"aria-label":"Slider example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SliderRoot } from "@uifn/components-svelte/slider";
</script>

<SliderRoot aria-label="Slider example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SliderRoot } from "./components/uifn/svelte/slider/index.js";
</script>

<SliderRoot aria-label="Slider example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SliderRoot } from "@uifn/components-solid/slider";

export function SliderExample() {
  return createComponent(SliderRoot, {"aria-label":"Slider example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SliderRoot } from "./components/uifn/solid/slider.js";

export function SliderExample() {
  return createComponent(SliderRoot, {"aria-label":"Slider example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add slider --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to Slider; implementation vectors own exact behavior.
