# PinInput

Canonical primitive: `pin-input`.

## Overview

<a id="overview"></a>

PinInput is the stable styled forms-input primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `PinInputRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `PinInputLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `PinInputControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `input` | `PinInputInput` | `input` | many | `number` | `value: number`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: number`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: number`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `PinInputHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `error` | `PinInputError` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/pin-input: createPinInputController(props, environment?)`
- State: `PinInputState`
- Actions: `PinInputActions`
- Parts: `PinInputController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `PinInputProvider and usePinInput(inputs); adapter context remains private`
- svelte context: `PinInputProvider; adapter context remains private to compound descendants`
- solid context: `PinInputProvider; adapter context remains private to compound descendants`

States:

- `empty` (semantic)
- `partial` (semantic)
- `complete` (semantic)
- `invalid` (semantic)

Complete transition signatures:

- `{ type: "INPUT_SEGMENT" }` — PinInput semantic transition event INPUT_SEGMENT. Source: controller-or-native-contract.
- `{ type: "PASTE" }` — PinInput semantic transition event PASTE. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_START" }` — PinInput semantic transition event COMPOSITION_START. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_END"; value: string }` — PinInput semantic transition event COMPOSITION_END. Source: controller-or-native-contract.
- `{ type: "BACKSPACE" }` — PinInput semantic transition event BACKSPACE. Source: controller-or-native-contract.
- `{ type: "FOCUS_SEGMENT" }` — PinInput semantic transition event FOCUS_SEGMENT. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — PinInput semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string) => void` — Called after PinInput requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical PinInput contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical PinInput contract. |
| `length` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive length input from the canonical PinInput contract. |
| `mask` | `boolean` | no | yes | `undefined → false` | Optional reactive mask input from the canonical PinInput contract. |
| `otp` | `boolean` | no | yes | `undefined → false` | Optional reactive otp input from the canonical PinInput contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical PinInput contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical PinInput contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical PinInput contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical PinInput contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `forms-input`. Native semantic basis: Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.3.1, 3.3.2, 3.3.3, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-spinbutton. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-input-plus-declared-enhancements`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `composition`. Pointer/touch obligations: native-control-interaction, target-size, file-picker-where-applicable. Focus obligations: visible-input-focus, error-focus-policy, caret-and-selection-preservation.

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

Use the compound root `PinInput` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="pin-input"` on all styled parts; stable.
- `data-uifn-part="root | label | control | input | hiddenInput | error"` on all styled parts; stable.
- `data-state="empty | partial | complete | invalid"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/pin-input` | `components/uifn/react/pin-input.ts` |
| svelte | `@uifn/components-svelte/pin-input` | `components/uifn/svelte/pin-input/index.ts` |
| solid | `@uifn/components-solid/pin-input` | `components/uifn/solid/pin-input.ts` |

#### React · package

```tsx
import * as React from 'react';
import { PinInputRoot } from '@uifn/components-react/pin-input';

export function PinInputExample() {
  return React.createElement(PinInputRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { PinInputRoot } from './components/uifn/react/pin-input.js';

export function PinInputExample() {
  return React.createElement(PinInputRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { PinInputRoot } from '@uifn/components-svelte/pin-input';
</script>

<PinInputRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { PinInputRoot } from './components/uifn/svelte/pin-input/index.js';
</script>

<PinInputRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { PinInputRoot } from '@uifn/components-solid/pin-input';

export function PinInputExample() {
  return createComponent(PinInputRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { PinInputRoot } from './components/uifn/solid/pin-input.js';

export function PinInputExample() {
  return createComponent(PinInputRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add pin-input --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the forms-input profile specifically to PinInput; implementation vectors own exact behavior.
