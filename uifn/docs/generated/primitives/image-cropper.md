# ImageCropper

Canonical primitive: `image-cropper`.

## Overview

<a id="overview"></a>

ImageCropper is the stable styled range-gesture primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ImageCropperRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `viewport` | `ImageCropperViewport` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `image` | `ImageCropperImage` | `img` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `cropArea` | `ImageCropperCropArea` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `handle` | `ImageCropperHandle` | `div` | many | `'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'` | `value: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `zoomControl` | `ImageCropperZoomControl` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `status` | `ImageCropperStatus` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/image-cropper: createImageCropperController(props, environment?)`
- State: `ImageCropperState`
- Actions: `ImageCropperActions`
- Parts: `ImageCropperController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `ImageCropperProvider and useImageCropper(inputs); adapter context remains private`
- svelte context: `ImageCropperProvider; adapter context remains private to compound descendants`
- solid context: `ImageCropperProvider; adapter context remains private to compound descendants`

States:

- `loading` (semantic)
- `ready` (semantic)
- `dragging` (semantic)
- `resizing` (semantic)
- `error` (semantic)

Complete transition signatures:

- `{ type: "LOAD" }` — ImageCropper semantic transition event LOAD. Source: controller-or-native-contract.
- `{ type: "DRAG_START" }` — ImageCropper semantic transition event DRAG_START. Source: controller-or-native-contract.
- `{ type: "DRAG_MOVE" }` — ImageCropper semantic transition event DRAG_MOVE. Source: controller-or-native-contract.
- `{ type: "DRAG_END" }` — ImageCropper semantic transition event DRAG_END. Source: controller-or-native-contract.
- `{ type: "RESIZE_START" }` — ImageCropper semantic transition event RESIZE_START. Source: controller-or-native-contract.
- `{ type: "RESIZE_MOVE" }` — ImageCropper semantic transition event RESIZE_MOVE. Source: controller-or-native-contract.
- `{ type: "RESIZE_END" }` — ImageCropper semantic transition event RESIZE_END. Source: controller-or-native-contract.
- `{ type: "ZOOM" }` — ImageCropper semantic transition event ZOOM. Source: controller-or-native-contract.

Controlled callbacks:

- `onCropChange(value: rect) => void` — Called after ImageCropper requests a crop change. Controlled consumers must commit the value back through crop.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `src` | `string` | yes | yes | `required` | Required reactive src input from the canonical ImageCropper contract. |
| `crop` | `rect` | no | yes | `undefined (no public prop override)` | Optional reactive crop input from the canonical ImageCropper contract. |
| `defaultCrop` | `rect` | no | yes | `undefined (component initial value)` | Optional reactive defaultCrop input from the canonical ImageCropper contract. |
| `aspectRatio` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive aspectRatio input from the canonical ImageCropper contract. |
| `minSize` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive minSize input from the canonical ImageCropper contract. |
| `maxSize` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive maxSize input from the canonical ImageCropper contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical ImageCropper contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `crop`. Uncontrolled defaults: `defaultCrop`. Change events: `CROP_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `ImageCropper` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="image-cropper"` on all styled parts; stable.
- `data-uifn-part="root | viewport | image | cropArea | handle | zoomControl | status"` on all styled parts; stable.
- `data-state="loading | ready | dragging | resizing | error"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.

CSS variables:

- `--uifn-color-image-cropper-status` (shared)
- `--uifn-color-image-cropper-surface` (shared)
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
| react | `@uifn/components-react/image-cropper` | `components/uifn/react/image-cropper.ts` |
| svelte | `@uifn/components-svelte/image-cropper` | `components/uifn/svelte/image-cropper/ImageCropperCropArea.svelte` |
| solid | `@uifn/components-solid/image-cropper` | `components/uifn/solid/image-cropper.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ImageCropperRoot } from "@uifn/components-react/image-cropper";

export function ImageCropperExample() {
  return React.createElement(ImageCropperRoot, {"src":"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ImageCropperRoot } from "./components/uifn/react/image-cropper.js";

export function ImageCropperExample() {
  return React.createElement(ImageCropperRoot, {"src":"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ImageCropperRoot } from "@uifn/components-svelte/image-cropper";
</script>

<ImageCropperRoot src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ImageCropperRoot } from "./components/uifn/svelte/image-cropper/index.js";
</script>

<ImageCropperRoot src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ImageCropperRoot } from "@uifn/components-solid/image-cropper";

export function ImageCropperExample() {
  return createComponent(ImageCropperRoot, {"src":"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ImageCropperRoot } from "./components/uifn/solid/image-cropper.js";

export function ImageCropperExample() {
  return createComponent(ImageCropperRoot, {"src":"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add image-cropper --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the range-gesture profile specifically to ImageCropper; implementation vectors own exact behavior.
