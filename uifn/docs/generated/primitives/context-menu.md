# ContextMenu

Canonical primitive: `context-menu`.

## Overview

<a id="overview"></a>

ContextMenu is the stable styled menu-navigation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ContextMenuRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `ContextMenuTrigger` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `ContextMenuPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `ContextMenuContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `ContextMenuItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemIndicator` | `ContextMenuItemIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `separator` | `ContextMenuSeparator` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `group` | `ContextMenuGroup` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `groupLabel` | `ContextMenuGroupLabel` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `submenuTrigger` | `ContextMenuSubmenuTrigger` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `submenuContent` | `ContextMenuSubmenuContent` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/context-menu: createContextMenuController(props, environment?)`
- State: `ContextMenuState`
- Actions: `ContextMenuActions`
- Parts: `ContextMenuController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions
- react context: `ContextMenuProvider and useContextMenu(inputs); adapter context remains private`
- svelte context: `ContextMenuProvider; adapter context remains private to compound descendants`
- solid context: `ContextMenuProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `open` (semantic)
- `submenu-open` (semantic)

Complete transition signatures:

- `{ type: "CONTEXT_OPEN" }` — ContextMenu semantic transition event CONTEXT_OPEN. Source: controller-or-native-contract.
- `{ type: "LONG_PRESS_OPEN" }` — ContextMenu semantic transition event LONG_PRESS_OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — ContextMenu semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — ContextMenu semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "TYPEAHEAD" }` — ContextMenu semantic transition event TYPEAHEAD. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — ContextMenu semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "OPEN_SUBMENU" }` — ContextMenu semantic transition event OPEN_SUBMENU. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after ContextMenu requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical ContextMenu contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical ContextMenu contract. |
| `dir` | `string` | no | yes | `undefined → "ltr"` | Optional reactive dir input from the canonical ContextMenu contract. |
| `loop` | `boolean` | no | yes | `undefined → false` | Optional reactive loop input from the canonical ContextMenu contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `open`. Uncontrolled defaults: `defaultOpen`. Change events: `OPEN_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, positioning-auto-update, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `ContextMenu` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="context-menu"` on all styled parts; stable.
- `data-uifn-part="root | trigger | positioner | content | item | itemIndicator | separator | group | groupLabel | submenuTrigger | submenuContent"` on all styled parts; stable.
- `data-state="closed | open | submenu-open"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/context-menu` | `components/uifn/react/context-menu.ts` |
| svelte | `@uifn/components-svelte/context-menu` | `components/uifn/svelte/context-menu/ContextMenuContent.svelte` |
| solid | `@uifn/components-solid/context-menu` | `components/uifn/solid/context-menu.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ContextMenuRoot } from "@uifn/components-react/context-menu";

export function ContextMenuExample() {
  return React.createElement(ContextMenuRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ContextMenuRoot } from "./components/uifn/react/context-menu.js";

export function ContextMenuExample() {
  return React.createElement(ContextMenuRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ContextMenuRoot } from "@uifn/components-svelte/context-menu";
</script>

<ContextMenuRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ContextMenuRoot } from "./components/uifn/svelte/context-menu/index.js";
</script>

<ContextMenuRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ContextMenuRoot } from "@uifn/components-solid/context-menu";

export function ContextMenuExample() {
  return createComponent(ContextMenuRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ContextMenuRoot } from "./components/uifn/solid/context-menu.js";

export function ContextMenuExample() {
  return createComponent(ContextMenuRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add context-menu --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the menu-navigation profile specifically to ContextMenu; implementation vectors own exact behavior.
