# ColorPicker

Canonical primitive: `color-picker`.

## Overview

<a id="overview"></a>

ColorPicker is the stable styled date-color primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ColorPickerRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `ColorPickerLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `ColorPickerControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `ColorPickerTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `ColorPickerPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `ColorPickerContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `area` | `ColorPickerArea` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `areaThumb` | `ColorPickerAreaThumb` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `channelSlider` | `ColorPickerChannelSlider` | `div` | many | `'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `channelInput` | `ColorPickerChannelInput` | `input` | many | `'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'alpha'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `swatch` | `ColorPickerSwatch` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `ColorPickerHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/color-picker: createColorPickerController(props, environment?)`
- State: `ColorPickerState`
- Actions: `ColorPickerActions`
- Parts: `ColorPickerController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions
- react context: `ColorPickerProvider and useColorPicker(inputs); adapter context remains private`
- svelte context: `ColorPickerProvider; adapter context remains private to compound descendants`
- solid context: `ColorPickerProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `open` (semantic)
- `dragging` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — ColorPicker semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — ColorPicker semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "SET_CHANNEL" }` — ColorPicker semantic transition event SET_CHANNEL. Source: controller-or-native-contract.
- `{ type: "SET_AREA" }` — ColorPicker semantic transition event SET_AREA. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: string }` — ColorPicker semantic transition event SET_VALUE. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string) => void` — Called after ColorPicker requests a value change. Controlled consumers must commit the value back through value.
- `onOpenChange(value: boolean) => void` — Called after ColorPicker requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical ColorPicker contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical ColorPicker contract. |
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical ColorPicker contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical ColorPicker contract. |
| `colorSpace` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive colorSpace input from the canonical ColorPicker contract. |
| `alpha` | `boolean` | no | yes | `undefined → false` | Optional reactive alpha input from the canonical ColorPicker contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical ColorPicker contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical ColorPicker contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical ColorPicker contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `compound`. Controlled inputs: `value`, `open`. Uncontrolled defaults: `defaultValue`, `defaultOpen`. Change events: `VALUE_CHANGE`, `OPEN_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `date-color`. Native semantic basis: Expose structured locale-aware segments, grids, or channels rather than display-string identity.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-grid, wai-aria-apg-spinbutton. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `segment-grid-channel-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Escape`. Pointer/touch obligations: segment-or-grid-selection, drag-channel-with-keyboard-alternative. Focus obligations: segment-focus, grid-focus-repair, restore-focus.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `scalar`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `ColorPicker` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="color-picker"` on all styled parts; stable.
- `data-uifn-part="root | label | control | trigger | positioner | content | area | areaThumb | channelSlider | channelInput | swatch | hiddenInput"` on all styled parts; stable.
- `data-state="closed | open | dragging"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-readonly="true | false"` on parts whose semantics depend on this input; stable semantic state.

CSS variables:

- `--uifn-channel-position` (shared)
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
| react | `@uifn/components-react/color-picker` | `components/uifn/react/color-picker.ts` |
| svelte | `@uifn/components-svelte/color-picker` | `components/uifn/svelte/color-picker/ColorPickerArea.svelte` |
| solid | `@uifn/components-solid/color-picker` | `components/uifn/solid/color-picker.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ColorPickerRoot } from '@uifn/components-react/color-picker';

export function ColorPickerExample() {
  return React.createElement(ColorPickerRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ColorPickerRoot } from './components/uifn/react/color-picker.js';

export function ColorPickerExample() {
  return React.createElement(ColorPickerRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ColorPickerRoot } from '@uifn/components-svelte/color-picker';
</script>

<ColorPickerRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ColorPickerRoot } from './components/uifn/svelte/color-picker/index.js';
</script>

<ColorPickerRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ColorPickerRoot } from '@uifn/components-solid/color-picker';

export function ColorPickerExample() {
  return createComponent(ColorPickerRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ColorPickerRoot } from './components/uifn/solid/color-picker.js';

export function ColorPickerExample() {
  return createComponent(ColorPickerRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add color-picker --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the date-color profile specifically to ColorPicker; implementation vectors own exact behavior.
