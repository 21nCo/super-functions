# SegmentGroup

Canonical primitive: `segment-group`.

## Overview

<a id="overview"></a>

SegmentGroup is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SegmentGroupRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `SegmentGroupLabel` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `SegmentGroupItem` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemText` | `SegmentGroupItemText` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `SegmentGroupIndicator` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `SegmentGroupHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/segment-group: createSegmentGroupController(props, environment?)`
- State: `SegmentGroupState`
- Actions: `SegmentGroupActions`
- Parts: `SegmentGroupController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `SegmentGroupProvider and useSegmentGroup(inputs); adapter context remains private`
- svelte context: `SegmentGroupProvider; adapter context remains private to compound descendants`
- solid context: `SegmentGroupProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `focused` (semantic)
- `selected` (semantic)

Complete transition signatures:

- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — SegmentGroup semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — SegmentGroup semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: string }` — SegmentGroup semantic transition event SET_VALUE. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — SegmentGroup semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string) => void` — Called after SegmentGroup requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical SegmentGroup contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical SegmentGroup contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical SegmentGroup contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical SegmentGroup contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical SegmentGroup contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical SegmentGroup contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical SegmentGroup contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `selection-collection`. Native semantic basis: Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-listbox, wai-aria-apg-combobox, wai-aria-apg-radio. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `selection-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: select-item, toggle-item, touch-scroll-arbitration. Focus obligations: active-item, selected-item, dynamic-collection-focus-repair.

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

Use the compound root `SegmentGroup` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="segment-group"` on all styled parts; stable.
- `data-uifn-part="root | label | item | itemText | indicator | hiddenInput"` on all styled parts; stable.
- `data-state="idle | focused | selected"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.
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
| react | `@uifn/components-react/segment-group` | `components/uifn/react/segment-group.ts` |
| svelte | `@uifn/components-svelte/segment-group` | `components/uifn/svelte/segment-group/index.ts` |
| solid | `@uifn/components-solid/segment-group` | `components/uifn/solid/segment-group.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SegmentGroupRoot } from '@uifn/components-react/segment-group';

export function SegmentGroupExample() {
  return React.createElement(SegmentGroupRoot, {"aria-label":"SegmentGroup example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SegmentGroupRoot } from './components/uifn/react/segment-group.js';

export function SegmentGroupExample() {
  return React.createElement(SegmentGroupRoot, {"aria-label":"SegmentGroup example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SegmentGroupRoot } from '@uifn/components-svelte/segment-group';
</script>

<SegmentGroupRoot aria-label="SegmentGroup example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SegmentGroupRoot } from './components/uifn/svelte/segment-group/index.js';
</script>

<SegmentGroupRoot aria-label="SegmentGroup example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SegmentGroupRoot } from '@uifn/components-solid/segment-group';

export function SegmentGroupExample() {
  return createComponent(SegmentGroupRoot, {"aria-label":"SegmentGroup example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SegmentGroupRoot } from './components/uifn/solid/segment-group.js';

export function SegmentGroupExample() {
  return createComponent(SegmentGroupRoot, {"aria-label":"SegmentGroup example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add segment-group --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the selection-collection profile specifically to SegmentGroup; implementation vectors own exact behavior.
