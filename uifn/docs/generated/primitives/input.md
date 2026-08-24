# Input

Canonical primitive: `input`.

## Overview

<a id="overview"></a>

Input is the stable styled forms-input primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `InputRoot` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/input: InputContract`
- State: `InputState`
- Actions: `Record<string, never>`
- Parts: `InputContractParts`
- DOM owner: @uifn/dom owns form-bridges-live-regions
- react context: `InputProvider and useInput(inputs); adapter context remains private`
- svelte context: `InputProvider; adapter context remains private to compound descendants`
- solid context: `InputProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `focused` (semantic)
- `invalid` (semantic)
- `disabled` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `type` | `string` | no | yes | `undefined → "text"` | Optional reactive type input from the canonical Input contract. |
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Input contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical Input contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical Input contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Input contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical Input contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical Input contract. |
| `invalid` | `boolean` | no | yes | `undefined → false` | Optional reactive invalid input from the canonical Input contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `native`. Controlled inputs: `value`. Uncontrolled defaults: none. Change events: `NATIVE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `forms-input`. Native semantic basis: Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.3.1, 3.3.2, 3.3.3, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-spinbutton. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-input-plus-declared-enhancements`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `composition`. Pointer/touch obligations: native-control-interaction, target-size, file-picker-where-applicable. Focus obligations: visible-input-focus, error-focus-policy, caret-and-selection-preservation.

## Forms

<a id="forms"></a>

Participation: `native`; value shape: `native`; reset: `native`; validation: `native`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Input` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="input"` on all styled parts; stable.
- `data-uifn-part="root"` on all styled parts; stable.
- `data-state="idle | focused | invalid | disabled"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-readonly="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-invalid="true | false"` on parts whose semantics depend on this input; stable semantic state.

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
- `--uifn-control-padding-block` (shared)
- `--uifn-control-padding-inline` (shared)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/input` | `components/uifn/react/input.ts` |
| svelte | `@uifn/components-svelte/input` | `components/uifn/svelte/input/index.ts` |
| solid | `@uifn/components-solid/input` | `components/uifn/solid/input.ts` |

#### React · package

```tsx
import * as React from 'react';
import { InputRoot } from "@uifn/components-react/input";

export function InputExample() {
  return React.createElement(InputRoot, {"aria-label":"Input example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { InputRoot } from "./components/uifn/react/input.js";

export function InputExample() {
  return React.createElement(InputRoot, {"aria-label":"Input example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { InputRoot } from "@uifn/components-svelte/input";
</script>

<InputRoot aria-label="Input example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { InputRoot } from "./components/uifn/svelte/input/index.js";
</script>

<InputRoot aria-label="Input example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { InputRoot } from "@uifn/components-solid/input";

export function InputExample() {
  return createComponent(InputRoot, {"aria-label":"Input example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { InputRoot } from "./components/uifn/solid/input.js";

export function InputExample() {
  return createComponent(InputRoot, {"aria-label":"Input example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add input --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- Apply the forms-input profile specifically to Input; implementation vectors own exact behavior.
