# ScrollArea

Canonical primitive: `scroll-area`.

## Overview

<a id="overview"></a>

ScrollArea is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ScrollAreaRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `viewport` | `ScrollAreaViewport` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `ScrollAreaContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `scrollbar` | `ScrollAreaScrollbar` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `thumb` | `ScrollAreaThumb` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `corner` | `ScrollAreaCorner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/scroll-area: createScrollAreaController(props, environment?)`
- State: `ScrollAreaState`
- Actions: `ScrollAreaActions`
- Parts: `ScrollAreaController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability
- react context: `ScrollAreaProvider and useScrollArea(inputs); adapter context remains private`
- svelte context: `ScrollAreaProvider; adapter context remains private to compound descendants`
- solid context: `ScrollAreaProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `scrolling` (semantic)
- `dragging` (semantic)

Complete transition signatures:

- `{ type: "SCROLL" }` — ScrollArea semantic transition event SCROLL. Source: controller-or-native-contract.
- `{ type: "POINTER_START"; pointerId?: number; x?: number; y?: number }` — ScrollArea semantic transition event POINTER_START. Source: controller-or-native-contract.
- `{ type: "POINTER_MOVE"; pointerId?: number; x?: number; y?: number }` — ScrollArea semantic transition event POINTER_MOVE. Source: controller-or-native-contract.
- `{ type: "POINTER_END"; pointerId?: number; x?: number; y?: number }` — ScrollArea semantic transition event POINTER_END. Source: controller-or-native-contract.
- `{ type: "KEY_SCROLL" }` — ScrollArea semantic transition event KEY_SCROLL. Source: controller-or-native-contract.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `type` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive type input from the canonical ScrollArea contract. |
| `scrollHideDelay` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive scrollHideDelay input from the canonical ScrollArea contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical ScrollArea contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical ScrollArea contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `none`. Controlled inputs: none. Uncontrolled defaults: none. Change events: native events only. Do not switch mode after mount.

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

Use the compound root `ScrollArea` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="scroll-area"` on all styled parts; stable.
- `data-uifn-part="root | viewport | content | scrollbar | thumb | corner"` on all styled parts; stable.
- `data-state="idle | scrolling | dragging"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.
- `data-dir="string"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/scroll-area` | `components/uifn/react/scroll-area.ts` |
| svelte | `@uifn/components-svelte/scroll-area` | `components/uifn/svelte/scroll-area/index.ts` |
| solid | `@uifn/components-solid/scroll-area` | `components/uifn/solid/scroll-area.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ScrollAreaRoot } from "@uifn/components-react/scroll-area";

export function ScrollAreaExample() {
  return React.createElement(ScrollAreaRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ScrollAreaRoot } from "./components/uifn/react/scroll-area.js";

export function ScrollAreaExample() {
  return React.createElement(ScrollAreaRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ScrollAreaRoot } from "@uifn/components-svelte/scroll-area";
</script>

<ScrollAreaRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ScrollAreaRoot } from "./components/uifn/svelte/scroll-area/index.js";
</script>

<ScrollAreaRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ScrollAreaRoot } from "@uifn/components-solid/scroll-area";

export function ScrollAreaExample() {
  return createComponent(ScrollAreaRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ScrollAreaRoot } from "./components/uifn/solid/scroll-area.js";

export function ScrollAreaExample() {
  return createComponent(ScrollAreaRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add scroll-area --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to ScrollArea; implementation vectors own exact behavior.
