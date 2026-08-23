# Select

Canonical primitive: `select`.

## Overview

<a id="overview"></a>

Select is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SelectRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `SelectLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `SelectControl` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `SelectTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `valueText` | `SelectValueText` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `clear` | `SelectClear` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `SelectPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `SelectContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `SelectItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemText` | `SelectItemText` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemIndicator` | `SelectItemIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `group` | `SelectGroup` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `groupLabel` | `SelectGroupLabel` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `SelectHiddenInput` | `input` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/select: createSelectController(props, environment?)`
- State: `SelectState`
- Actions: `SelectActions`
- Parts: `SelectController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions
- react context: `SelectProvider and useSelect(inputs); adapter context remains private`
- svelte context: `SelectProvider; adapter context remains private to compound descendants`
- solid context: `SelectProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `open` (semantic)
- `selecting` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — Select semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Select semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — Select semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "TYPEAHEAD" }` — Select semantic transition event TYPEAHEAD. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Select semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "DESELECT" }` — Select semantic transition event DESELECT. Source: controller-or-native-contract.
- `{ type: "CLEAR"; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Select semantic transition event CLEAR. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — Select semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: UIFnSelectionValue) => void` — Called after Select requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `UIFnSelectionValue` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Select contract. |
| `defaultValue` | `UIFnSelectionValue` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical Select contract. |
| `items` | `readonly TItem[]` | yes | yes | `required` | Required reactive items input from the canonical Select contract. |
| `multiple` | `boolean` | no | yes | `undefined → false` | Optional reactive multiple input from the canonical Select contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical Select contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Select contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical Select contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical Select contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single-or-multiple`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Select` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="select"` on all styled parts; stable.
- `data-uifn-part="root | label | control | trigger | valueText | clear | positioner | content | item | itemText | itemIndicator | group | groupLabel | hiddenInput"` on all styled parts; stable.
- `data-state="closed | open | selecting"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/select` | `components/uifn/react/select.ts` |
| svelte | `@uifn/components-svelte/select` | `components/uifn/svelte/select/index.ts` |
| solid | `@uifn/components-solid/select` | `components/uifn/solid/select.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SelectRoot } from '@uifn/components-react/select';

export function SelectExample() {
  return React.createElement(SelectRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SelectRoot } from './components/uifn/react/select.js';

export function SelectExample() {
  return React.createElement(SelectRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SelectRoot } from '@uifn/components-svelte/select';
</script>

<SelectRoot items={[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]} />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SelectRoot } from './components/uifn/svelte/select/index.js';
</script>

<SelectRoot items={[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]} />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SelectRoot } from '@uifn/components-solid/select';

export function SelectExample() {
  return createComponent(SelectRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SelectRoot } from './components/uifn/solid/select.js';

export function SelectExample() {
  return createComponent(SelectRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add select --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the selection-collection profile specifically to Select; implementation vectors own exact behavior.
