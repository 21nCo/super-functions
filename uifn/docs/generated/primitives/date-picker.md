# DatePicker

Canonical primitive: `date-picker`.

## Overview

<a id="overview"></a>

DatePicker is the stable styled date-color primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `DatePickerRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `DatePickerLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `input` | `DatePickerInput` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `segment` | `DatePickerSegment` | `span` | many | `'year' | 'month' | 'day'` | `value: 'year' | 'month' | 'day'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'year' | 'month' | 'day'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'year' | 'month' | 'day'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `DatePickerTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `DatePickerPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `DatePickerContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `header` | `DatePickerHeader` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `previous` | `DatePickerPrevious` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `next` | `DatePickerNext` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `grid` | `DatePickerGrid` | `table` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `gridLabel` | `DatePickerGridLabel` | `caption` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `cell` | `DatePickerCell` | `td` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `cellTrigger` | `DatePickerCellTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `DatePickerHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/date-picker: createDatePickerController(props, environment?)`
- State: `DatePickerState`
- Actions: `DatePickerActions`
- Parts: `DatePickerController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions
- react context: `DatePickerProvider and useDatePicker(inputs); adapter context remains private`
- svelte context: `DatePickerProvider; adapter context remains private to compound descendants`
- solid context: `DatePickerProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `open` (semantic)
- `editing` (semantic)
- `invalid` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — DatePicker semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — DatePicker semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "EDIT_SEGMENT" }` — DatePicker semantic transition event EDIT_SEGMENT. Source: controller-or-native-contract.
- `{ type: "NAVIGATE_MONTH" }` — DatePicker semantic transition event NAVIGATE_MONTH. Source: controller-or-native-contract.
- `{ type: "NAVIGATE_GRID" }` — DatePicker semantic transition event NAVIGATE_GRID. Source: controller-or-native-contract.
- `{ type: "SELECT_DATE" }` — DatePicker semantic transition event SELECT_DATE. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — DatePicker semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: structured-date) => void` — Called after DatePicker requests a value change. Controlled consumers must commit the value back through value.
- `onOpenChange(value: boolean) => void` — Called after DatePicker requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `structured-date` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical DatePicker contract. |
| `defaultValue` | `structured-date` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical DatePicker contract. |
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical DatePicker contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical DatePicker contract. |
| `locale` | `string` | no | yes | `undefined → environment locale` | Optional reactive locale input from the canonical DatePicker contract. |
| `timeZone` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive timeZone input from the canonical DatePicker contract. |
| `min` | `structured-date` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical DatePicker contract. |
| `max` | `structured-date` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical DatePicker contract. |
| `unavailable` | `date-predicate` | no | yes | `undefined (no public prop override)` | Optional reactive unavailable input from the canonical DatePicker contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical DatePicker contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical DatePicker contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical DatePicker contract. |

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

Use the compound root `DatePicker` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="date-picker"` on all styled parts; stable.
- `data-uifn-part="root | label | input | segment | trigger | positioner | content | header | previous | next | grid | gridLabel | cell | cellTrigger | hiddenInput"` on all styled parts; stable.
- `data-state="closed | open | editing | invalid"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/date-picker` | `components/uifn/react/date-picker.ts` |
| svelte | `@uifn/components-svelte/date-picker` | `components/uifn/svelte/date-picker/DatePickerCell.svelte` |
| solid | `@uifn/components-solid/date-picker` | `components/uifn/solid/date-picker.ts` |

#### React · package

```tsx
import * as React from 'react';
import { DatePickerRoot } from "@uifn/components-react/date-picker";

export function DatePickerExample() {
  return React.createElement(DatePickerRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { DatePickerRoot } from "./components/uifn/react/date-picker.js";

export function DatePickerExample() {
  return React.createElement(DatePickerRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { DatePickerRoot } from "@uifn/components-svelte/date-picker";
</script>

<DatePickerRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { DatePickerRoot } from "./components/uifn/svelte/date-picker/index.js";
</script>

<DatePickerRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { DatePickerRoot } from "@uifn/components-solid/date-picker";

export function DatePickerExample() {
  return createComponent(DatePickerRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { DatePickerRoot } from "./components/uifn/solid/date-picker.js";

export function DatePickerExample() {
  return createComponent(DatePickerRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add date-picker --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the date-color profile specifically to DatePicker; implementation vectors own exact behavior.
