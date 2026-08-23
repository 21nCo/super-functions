# Carousel

Canonical primitive: `carousel`.

## Overview

<a id="overview"></a>

Carousel is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `CarouselRoot` | `section` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `viewport` | `CarouselViewport` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `CarouselItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `previous` | `CarouselPrevious` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `next` | `CarouselNext` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicatorGroup` | `CarouselIndicatorGroup` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `CarouselIndicator` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `liveRegion` | `CarouselLiveRegion` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/carousel: createCarouselController(props, environment?)`
- State: `CarouselState`
- Actions: `CarouselActions`
- Parts: `CarouselController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions, portal-presence-transitions
- react context: `CarouselProvider and useCarousel(inputs); adapter context remains private`
- svelte context: `CarouselProvider; adapter context remains private to compound descendants`
- solid context: `CarouselProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `dragging` (semantic)
- `autoplaying` (semantic)
- `paused` (semantic)

Complete transition signatures:

- `{ type: "PREVIOUS" }` — Carousel semantic transition event PREVIOUS. Source: controller-or-native-contract.
- `{ type: "NEXT" }` — Carousel semantic transition event NEXT. Source: controller-or-native-contract.
- `{ type: "GO_TO"; index: number }` — Carousel semantic transition event GO_TO. Source: controller-or-native-contract.
- `{ type: "DRAG_START" }` — Carousel semantic transition event DRAG_START. Source: controller-or-native-contract.
- `{ type: "DRAG_END" }` — Carousel semantic transition event DRAG_END. Source: controller-or-native-contract.
- `{ type: "PAUSE" }` — Carousel semantic transition event PAUSE. Source: controller-or-native-contract.
- `{ type: "RESUME" }` — Carousel semantic transition event RESUME. Source: controller-or-native-contract.

Controlled callbacks:

- `onIndexChange(value: number) => void` — Called after Carousel requests a index change. Controlled consumers must commit the value back through index.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `index` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive index input from the canonical Carousel contract. |
| `defaultIndex` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultIndex input from the canonical Carousel contract. |
| `itemCount` | `number` | yes | yes | `required` | Required reactive itemCount input from the canonical Carousel contract. |
| `loop` | `boolean` | no | yes | `undefined → false` | Optional reactive loop input from the canonical Carousel contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Carousel contract. |
| `autoplayDelay` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive autoplayDelay input from the canonical Carousel contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `index`. Uncontrolled defaults: `defaultIndex`. Change events: `INDEX_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Carousel` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="carousel"` on all styled parts; stable.
- `data-uifn-part="root | viewport | item | previous | next | indicatorGroup | indicator | liveRegion"` on all styled parts; stable.
- `data-state="idle | dragging | autoplaying | paused"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/carousel` | `components/uifn/react/carousel.ts` |
| svelte | `@uifn/components-svelte/carousel` | `components/uifn/svelte/carousel/CarouselIndicator.svelte` |
| solid | `@uifn/components-solid/carousel` | `components/uifn/solid/carousel.ts` |

#### React · package

```tsx
import * as React from 'react';
import { CarouselRoot } from '@uifn/components-react/carousel';

export function CarouselExample() {
  return React.createElement(CarouselRoot, {"itemCount":1,"aria-label":"Carousel example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { CarouselRoot } from './components/uifn/react/carousel.js';

export function CarouselExample() {
  return React.createElement(CarouselRoot, {"itemCount":1,"aria-label":"Carousel example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { CarouselRoot } from '@uifn/components-svelte/carousel';
</script>

<CarouselRoot itemCount={1} aria-label="Carousel example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { CarouselRoot } from './components/uifn/svelte/carousel/index.js';
</script>

<CarouselRoot itemCount={1} aria-label="Carousel example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { CarouselRoot } from '@uifn/components-solid/carousel';

export function CarouselExample() {
  return createComponent(CarouselRoot, {"itemCount":1,"aria-label":"Carousel example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { CarouselRoot } from './components/uifn/solid/carousel.js';

export function CarouselExample() {
  return createComponent(CarouselRoot, {"itemCount":1,"aria-label":"Carousel example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add carousel --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to Carousel; implementation vectors own exact behavior.
