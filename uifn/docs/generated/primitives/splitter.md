# Splitter

Canonical primitive: `splitter`.

## Overview

<a id="overview"></a>

Splitter is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SplitterRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `panel` | `SplitterPanel` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `resizeTrigger` | `SplitterResizeTrigger` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `resizeHandle` | `SplitterResizeHandle` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/splitter: createSplitterController(props, environment?)`
- State: `SplitterState`
- Actions: `SplitterActions`
- Parts: `SplitterController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability
- react context: `SplitterProvider and useSplitter(inputs); adapter context remains private`
- svelte context: `SplitterProvider; adapter context remains private to compound descendants`
- solid context: `SplitterProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `resizing` (semantic)

Complete transition signatures:

- `{ type: "RESIZE_START" }` — Splitter semantic transition event RESIZE_START. Source: controller-or-native-contract.
- `{ type: "RESIZE_MOVE" }` — Splitter semantic transition event RESIZE_MOVE. Source: controller-or-native-contract.
- `{ type: "RESIZE_END" }` — Splitter semantic transition event RESIZE_END. Source: controller-or-native-contract.
- `{ type: "RESIZE_CANCEL" }` — Splitter semantic transition event RESIZE_CANCEL. Source: controller-or-native-contract.
- `{ type: "KEY_RESIZE" }` — Splitter semantic transition event KEY_RESIZE. Source: controller-or-native-contract.
- `{ type: "COLLAPSE" }` — Splitter semantic transition event COLLAPSE. Source: controller-or-native-contract.
- `{ type: "EXPAND" }` — Splitter semantic transition event EXPAND. Source: controller-or-native-contract.

Controlled callbacks:

- `onSizesChange(value: number[]) => void` — Called after Splitter requests a sizes change. Controlled consumers must commit the value back through sizes.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `sizes` | `number[]` | no | yes | `undefined (no public prop override)` | Optional reactive sizes input from the canonical Splitter contract. |
| `defaultSizes` | `number[]` | no | yes | `undefined → []` | Optional reactive defaultSizes input from the canonical Splitter contract. |
| `minSizes` | `number[]` | no | yes | `undefined (no public prop override)` | Optional reactive minSizes input from the canonical Splitter contract. |
| `maxSizes` | `number[]` | no | yes | `undefined (no public prop override)` | Optional reactive maxSizes input from the canonical Splitter contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Splitter contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical Splitter contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Splitter contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `multiple`. Controlled inputs: `sizes`. Uncontrolled defaults: `defaultSizes`. Change events: `SIZES_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `range-gesture`. Native semantic basis: Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.7, 2.5.1, 2.5.7, 2.5.8, 4.1.2. Normative basis: native-html, wai-aria-apg-slider, wai-aria-apg-carousel. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `range-or-gesture-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`. Pointer/touch obligations: pointer-capture, cancel-and-lost-capture, touch-scroll-arbitration, keyboard-alternative. Focus obligations: focusable-operable-handle, multi-handle-order, visible-focus.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Splitter` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="splitter"` on all styled parts; stable.
- `data-uifn-part="root | panel | resizeTrigger | resizeHandle"` on all styled parts; stable.
- `data-state="idle | resizing"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.
- `data-dir="string"` on parts whose semantics depend on this input; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/splitter` | `components/uifn/react/splitter.ts` |
| svelte | `@uifn/components-svelte/splitter` | `components/uifn/svelte/splitter/index.ts` |
| solid | `@uifn/components-solid/splitter` | `components/uifn/solid/splitter.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SplitterRoot } from '@uifn/components-react/splitter';

export function SplitterExample() {
  return React.createElement(SplitterRoot, {"aria-label":"Splitter example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SplitterRoot } from './components/uifn/react/splitter.js';

export function SplitterExample() {
  return React.createElement(SplitterRoot, {"aria-label":"Splitter example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SplitterRoot } from '@uifn/components-svelte/splitter';
</script>

<SplitterRoot aria-label="Splitter example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SplitterRoot } from './components/uifn/svelte/splitter/index.js';
</script>

<SplitterRoot aria-label="Splitter example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SplitterRoot } from '@uifn/components-solid/splitter';

export function SplitterExample() {
  return createComponent(SplitterRoot, {"aria-label":"Splitter example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SplitterRoot } from './components/uifn/solid/splitter.js';

export function SplitterExample() {
  return createComponent(SplitterRoot, {"aria-label":"Splitter example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add splitter --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to Splitter; implementation vectors own exact behavior.
