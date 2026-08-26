# Tabs

Canonical primitive: `tabs`.

## Overview

<a id="overview"></a>

Tabs is the stable styled menu-navigation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `TabsRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `list` | `TabsList` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `TabsTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `TabsContent` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `TabsIndicator` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/tabs: createTabsController(props, environment?)`
- State: `TabsState`
- Actions: `TabsActions`
- Parts: `TabsController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability
- react context: `TabsProvider and useTabs(inputs); adapter context remains private`
- svelte context: `TabsProvider; adapter context remains private to compound descendants`
- solid context: `TabsProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `focused` (semantic)
- `selected` (semantic)

Complete transition signatures:

- `{ type: "FOCUS_TAB" }` — Tabs semantic transition event FOCUS_TAB. Source: controller-or-native-contract.
- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — Tabs semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "ACTIVATE" }` — Tabs semantic transition event ACTIVATE. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: string }` — Tabs semantic transition event SET_VALUE. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string) => void` — Called after Tabs requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Tabs contract. |
| `defaultValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultValue input from the canonical Tabs contract. |
| `activationMode` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive activationMode input from the canonical Tabs contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Tabs contract. |
| `loop` | `boolean` | no | yes | `undefined → false` | Optional reactive loop input from the canonical Tabs contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical Tabs contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `menu-navigation`. Native semantic basis: Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7, 4.1.2. Normative basis: native-html, wai-aria-apg-menu, wai-aria-apg-tabs, wai-aria-apg-treeview. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `primitive-specific-navigation`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: item-activation, submenu-pointer-grace-where-applicable, contextmenu-where-applicable. Focus obligations: roving-tabindex-or-activedescendant, deterministic-focus-repair, restore-focus.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Tabs` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="tabs"` on all styled parts; stable.
- `data-uifn-part="root | list | trigger | content | indicator"` on all styled parts; stable.
- `data-state="idle | focused | selected"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.
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
| react | `@uifn/components-react/tabs` | `components/uifn/react/tabs.ts` |
| svelte | `@uifn/components-svelte/tabs` | `components/uifn/svelte/tabs/index.ts` |
| solid | `@uifn/components-solid/tabs` | `components/uifn/solid/tabs.ts` |

#### React · package

```tsx
import * as React from 'react';
import { TabsRoot } from "@uifn/components-react/tabs";

export function TabsExample() {
  return React.createElement(TabsRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { TabsRoot } from "./components/uifn/react/tabs.js";

export function TabsExample() {
  return React.createElement(TabsRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { TabsRoot } from "@uifn/components-svelte/tabs";
</script>

<TabsRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { TabsRoot } from "./components/uifn/svelte/tabs/index.js";
</script>

<TabsRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { TabsRoot } from "@uifn/components-solid/tabs";

export function TabsExample() {
  return createComponent(TabsRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { TabsRoot } from "./components/uifn/solid/tabs.js";

export function TabsExample() {
  return createComponent(TabsRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add tabs --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the menu-navigation profile specifically to Tabs; implementation vectors own exact behavior.
