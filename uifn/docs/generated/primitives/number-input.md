# NumberInput

Canonical primitive: `number-input`.

## Overview

<a id="overview"></a>

NumberInput is the stable styled forms-input primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `NumberInputRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `NumberInputLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `NumberInputControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `input` | `NumberInputInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `increment` | `NumberInputIncrement` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `decrement` | `NumberInputDecrement` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `scrubber` | `NumberInputScrubber` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `NumberInputHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `error` | `NumberInputError` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/number-input: createNumberInputController(props, environment?)`
- State: `NumberInputState`
- Actions: `NumberInputActions`
- Parts: `NumberInputController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `NumberInputProvider and useNumberInput(inputs); adapter context remains private`
- svelte context: `NumberInputProvider; adapter context remains private to compound descendants`
- solid context: `NumberInputProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `editing` (semantic)
- `scrubbing` (semantic)
- `invalid` (semantic)

Complete transition signatures:

- `{ type: "INPUT"; value: string }` — NumberInput semantic transition event INPUT. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_START" }` — NumberInput semantic transition event COMPOSITION_START. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_END"; value: string }` — NumberInput semantic transition event COMPOSITION_END. Source: controller-or-native-contract.
- `{ type: "INCREMENT" }` — NumberInput semantic transition event INCREMENT. Source: controller-or-native-contract.
- `{ type: "DECREMENT" }` — NumberInput semantic transition event DECREMENT. Source: controller-or-native-contract.
- `{ type: "SCRUB_START" }` — NumberInput semantic transition event SCRUB_START. Source: controller-or-native-contract.
- `{ type: "SCRUB_MOVE" }` — NumberInput semantic transition event SCRUB_MOVE. Source: controller-or-native-contract.
- `{ type: "SCRUB_END" }` — NumberInput semantic transition event SCRUB_END. Source: controller-or-native-contract.
- `{ type: "COMMIT" }` — NumberInput semantic transition event COMMIT. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — NumberInput semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string) => void` — Called after NumberInput requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical NumberInput contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical NumberInput contract. |
| `min` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical NumberInput contract. |
| `max` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical NumberInput contract. |
| `step` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive step input from the canonical NumberInput contract. |
| `locale` | `string` | no | yes | `undefined → environment locale` | Optional reactive locale input from the canonical NumberInput contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical NumberInput contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical NumberInput contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical NumberInput contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical NumberInput contract. |

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

Use the compound root `NumberInput` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="number-input"` on all styled parts; stable.
- `data-uifn-part="root | label | control | input | increment | decrement | scrubber | hiddenInput | error"` on all styled parts; stable.
- `data-state="idle | editing | scrubbing | invalid"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/number-input` | `components/uifn/react/number-input.ts` |
| svelte | `@uifn/components-svelte/number-input` | `components/uifn/svelte/number-input/index.ts` |
| solid | `@uifn/components-solid/number-input` | `components/uifn/solid/number-input.ts` |

#### React · package

```tsx
import * as React from 'react';
import { NumberInputRoot } from '@uifn/components-react/number-input';

export function NumberInputExample() {
  return React.createElement(NumberInputRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { NumberInputRoot } from './components/uifn/react/number-input.js';

export function NumberInputExample() {
  return React.createElement(NumberInputRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { NumberInputRoot } from '@uifn/components-svelte/number-input';
</script>

<NumberInputRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { NumberInputRoot } from './components/uifn/svelte/number-input/index.js';
</script>

<NumberInputRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { NumberInputRoot } from '@uifn/components-solid/number-input';

export function NumberInputExample() {
  return createComponent(NumberInputRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { NumberInputRoot } from './components/uifn/solid/number-input.js';

export function NumberInputExample() {
  return createComponent(NumberInputRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add number-input --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the forms-input profile specifically to NumberInput; implementation vectors own exact behavior.
