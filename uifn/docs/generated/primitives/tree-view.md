# TreeView

Canonical primitive: `tree-view`.

## Overview

<a id="overview"></a>

TreeView is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `TreeViewRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `TreeViewLabel` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `tree` | `TreeViewTree` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `TreeViewItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemTrigger` | `TreeViewItemTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemText` | `TreeViewItemText` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `branch` | `TreeViewBranch` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `TreeViewIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/tree-view: createTreeViewController(props, environment?)`
- State: `TreeViewState`
- Actions: `TreeViewActions`
- Parts: `TreeViewController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `TreeViewProvider and useTreeView(inputs); adapter context remains private`
- svelte context: `TreeViewProvider; adapter context remains private to compound descendants`
- solid context: `TreeViewProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `focused` (semantic)
- `loading` (semantic)
- `expanded` (semantic)

Complete transition signatures:

- `{ type: "FOCUS_ITEM" }` — TreeView semantic transition event FOCUS_ITEM. Source: controller-or-native-contract.
- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — TreeView semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "TYPEAHEAD" }` — TreeView semantic transition event TYPEAHEAD. Source: controller-or-native-contract.
- `{ type: "EXPAND" }` — TreeView semantic transition event EXPAND. Source: controller-or-native-contract.
- `{ type: "COLLAPSE" }` — TreeView semantic transition event COLLAPSE. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — TreeView semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "LOAD_CHILDREN" }` — TreeView semantic transition event LOAD_CHILDREN. Source: controller-or-native-contract.

Controlled callbacks:

- `onExpandedChange(value: string[]) => void` — Called after TreeView requests a expanded change. Controlled consumers must commit the value back through expanded.
- `onSelectionChange(value: readonly string[]) => void` — Called after TreeView requests a selection change. Controlled consumers must commit the value back through selection.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `expanded` | `string[]` | no | yes | `undefined (no public prop override)` | Optional reactive expanded input from the canonical TreeView contract. |
| `defaultExpanded` | `string[]` | no | yes | `undefined → []` | Optional reactive defaultExpanded input from the canonical TreeView contract. |
| `selection` | `readonly string[]` | no | yes | `undefined (no public prop override)` | Optional reactive selection input from the canonical TreeView contract. |
| `defaultSelection` | `readonly string[]` | no | yes | `undefined → []` | Optional reactive defaultSelection input from the canonical TreeView contract. |
| `items` | `tree-node[]` | yes | yes | `required` | Required reactive items input from the canonical TreeView contract. |
| `selectionMode` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive selectionMode input from the canonical TreeView contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical TreeView contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `compound`. Controlled inputs: `expanded`, `selection`. Uncontrolled defaults: `defaultExpanded`, `defaultSelection`. Change events: `EXPANDED_CHANGE`, `SELECTION_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `selection-collection`. Native semantic basis: Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-listbox, wai-aria-apg-combobox, wai-aria-apg-radio. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `selection-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: select-item, toggle-item, touch-scroll-arbitration. Focus obligations: active-item, selected-item, dynamic-collection-focus-repair.

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

Use the compound root `TreeView` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="tree-view"` on all styled parts; stable.
- `data-uifn-part="root | label | tree | item | itemTrigger | itemText | branch | indicator"` on all styled parts; stable.
- `data-state="idle | focused | loading | expanded"` on stateful parts; stable semantic state.
- `data-dir="string"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/tree-view` | `components/uifn/react/tree-view.ts` |
| svelte | `@uifn/components-svelte/tree-view` | `components/uifn/svelte/tree-view/index.ts` |
| solid | `@uifn/components-solid/tree-view` | `components/uifn/solid/tree-view.ts` |

#### React · package

```tsx
import * as React from 'react';
import { TreeViewRoot } from "@uifn/components-react/tree-view";

export function TreeViewExample() {
  return React.createElement(TreeViewRoot, {"items":[{"id":"item-1","textValue":"Item 1"}]});
}
```

#### React · source

```tsx
import * as React from 'react';
import { TreeViewRoot } from "./components/uifn/react/tree-view.js";

export function TreeViewExample() {
  return React.createElement(TreeViewRoot, {"items":[{"id":"item-1","textValue":"Item 1"}]});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { TreeViewRoot } from "@uifn/components-svelte/tree-view";
</script>

<TreeViewRoot items={[{"id":"item-1","textValue":"Item 1"}]} />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { TreeViewRoot } from "./components/uifn/svelte/tree-view/index.js";
</script>

<TreeViewRoot items={[{"id":"item-1","textValue":"Item 1"}]} />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { TreeViewRoot } from "@uifn/components-solid/tree-view";

export function TreeViewExample() {
  return createComponent(TreeViewRoot, {"items":[{"id":"item-1","textValue":"Item 1"}]});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { TreeViewRoot } from "./components/uifn/solid/tree-view.js";

export function TreeViewExample() {
  return createComponent(TreeViewRoot, {"items":[{"id":"item-1","textValue":"Item 1"}]});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add tree-view --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the selection-collection profile specifically to TreeView; implementation vectors own exact behavior.
