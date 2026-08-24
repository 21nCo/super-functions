# DateInput

Canonical primitive: `date-input`.

## Overview

<a id="overview"></a>

DateInput is the stable styled date-color primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `DateInputRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `DateInputLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `segment` | `DateInputSegment` | `span` | many | `'year' | 'month' | 'day'` | `value: 'year' | 'month' | 'day'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'year' | 'month' | 'day'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'year' | 'month' | 'day'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `DateInputHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `error` | `DateInputError` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/date-input: createDateInputController(props, environment?)`
- State: `DateInputState`
- Actions: `DateInputActions`
- Parts: `DateInputController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `DateInputProvider and useDateInput(inputs); adapter context remains private`
- svelte context: `DateInputProvider; adapter context remains private to compound descendants`
- solid context: `DateInputProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `editing` (semantic)
- `invalid` (semantic)

Complete transition signatures:

- `{ type: "FOCUS_SEGMENT" }` — DateInput semantic transition event FOCUS_SEGMENT. Source: controller-or-native-contract.
- `{ type: "EDIT_SEGMENT" }` — DateInput semantic transition event EDIT_SEGMENT. Source: controller-or-native-contract.
- `{ type: "INCREMENT" }` — DateInput semantic transition event INCREMENT. Source: controller-or-native-contract.
- `{ type: "DECREMENT" }` — DateInput semantic transition event DECREMENT. Source: controller-or-native-contract.
- `{ type: "COMMIT" }` — DateInput semantic transition event COMMIT. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — DateInput semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: structured-date) => void` — Called after DateInput requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `structured-date` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical DateInput contract. |
| `defaultValue` | `structured-date` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical DateInput contract. |
| `locale` | `string` | no | yes | `undefined → environment locale` | Optional reactive locale input from the canonical DateInput contract. |
| `timeZone` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive timeZone input from the canonical DateInput contract. |
| `min` | `structured-date` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical DateInput contract. |
| `max` | `structured-date` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical DateInput contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical DateInput contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical DateInput contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical DateInput contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `DateInput` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="date-input"` on all styled parts; stable.
- `data-uifn-part="root | label | segment | hiddenInput | error"` on all styled parts; stable.
- `data-state="idle | editing | invalid"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/date-input` | `components/uifn/react/date-input.ts` |
| svelte | `@uifn/components-svelte/date-input` | `components/uifn/svelte/date-input/DateInputError.svelte` |
| solid | `@uifn/components-solid/date-input` | `components/uifn/solid/date-input.ts` |

#### React · package

```tsx
import * as React from 'react';
import { DateInputRoot } from "@uifn/components-react/date-input";

export function DateInputExample() {
  return React.createElement(DateInputRoot, {"aria-label":"DateInput example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { DateInputRoot } from "./components/uifn/react/date-input.js";

export function DateInputExample() {
  return React.createElement(DateInputRoot, {"aria-label":"DateInput example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { DateInputRoot } from "@uifn/components-svelte/date-input";
</script>

<DateInputRoot aria-label="DateInput example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { DateInputRoot } from "./components/uifn/svelte/date-input/index.js";
</script>

<DateInputRoot aria-label="DateInput example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { DateInputRoot } from "@uifn/components-solid/date-input";

export function DateInputExample() {
  return createComponent(DateInputRoot, {"aria-label":"DateInput example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { DateInputRoot } from "./components/uifn/solid/date-input.js";

export function DateInputExample() {
  return createComponent(DateInputRoot, {"aria-label":"DateInput example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add date-input --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the date-color profile specifically to DateInput; implementation vectors own exact behavior.
