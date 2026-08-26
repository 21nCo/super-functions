# CheckboxGroup

Canonical primitive: `checkbox-group`.

## Overview

<a id="overview"></a>

CheckboxGroup is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `CheckboxGroupRoot` | `fieldset` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `CheckboxGroupLabel` | `legend` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `CheckboxGroupItem` | `label` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemControl` | `CheckboxGroupItemControl` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemIndicator` | `CheckboxGroupItemIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `CheckboxGroupHiddenInput` | `input` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `error` | `CheckboxGroupError` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/checkbox-group: createCheckboxGroupController(props, environment?)`
- State: `CheckboxGroupState`
- Actions: `CheckboxGroupActions`
- Parts: `CheckboxGroupController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `CheckboxGroupProvider and useCheckboxGroup(inputs); adapter context remains private`
- svelte context: `CheckboxGroupProvider; adapter context remains private to compound descendants`
- solid context: `CheckboxGroupProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `invalid` (semantic)

Complete transition signatures:

- `{ type: "TOGGLE_ITEM"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — CheckboxGroup semantic transition event TOGGLE_ITEM. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: string[] }` — CheckboxGroup semantic transition event SET_VALUE. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — CheckboxGroup semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string[]) => void` — Called after CheckboxGroup requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string[]` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical CheckboxGroup contract. |
| `defaultValue` | `string[]` | no | yes | `undefined → []` | Optional reactive defaultValue input from the canonical CheckboxGroup contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical CheckboxGroup contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical CheckboxGroup contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical CheckboxGroup contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical CheckboxGroup contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `multiple`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `selection-collection`. Native semantic basis: Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-listbox, wai-aria-apg-combobox, wai-aria-apg-radio. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `selection-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: select-item, toggle-item, touch-scroll-arbitration. Focus obligations: active-item, selected-item, dynamic-collection-focus-repair.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `multiple`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `CheckboxGroup` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="checkbox-group"` on all styled parts; stable.
- `data-uifn-part="root | label | item | itemControl | itemIndicator | hiddenInput | error"` on all styled parts; stable.
- `data-state="idle | invalid"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/checkbox-group` | `components/uifn/react/checkbox-group.ts` |
| svelte | `@uifn/components-svelte/checkbox-group` | `components/uifn/svelte/checkbox-group/CheckboxGroupError.svelte` |
| solid | `@uifn/components-solid/checkbox-group` | `components/uifn/solid/checkbox-group.ts` |

#### React · package

```tsx
import * as React from 'react';
import { CheckboxGroupRoot } from "@uifn/components-react/checkbox-group";

export function CheckboxGroupExample() {
  return React.createElement(CheckboxGroupRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { CheckboxGroupRoot } from "./components/uifn/react/checkbox-group.js";

export function CheckboxGroupExample() {
  return React.createElement(CheckboxGroupRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { CheckboxGroupRoot } from "@uifn/components-svelte/checkbox-group";
</script>

<CheckboxGroupRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { CheckboxGroupRoot } from "./components/uifn/svelte/checkbox-group/index.js";
</script>

<CheckboxGroupRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { CheckboxGroupRoot } from "@uifn/components-solid/checkbox-group";

export function CheckboxGroupExample() {
  return createComponent(CheckboxGroupRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { CheckboxGroupRoot } from "./components/uifn/solid/checkbox-group.js";

export function CheckboxGroupExample() {
  return createComponent(CheckboxGroupRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add checkbox-group --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the selection-collection profile specifically to CheckboxGroup; implementation vectors own exact behavior.
