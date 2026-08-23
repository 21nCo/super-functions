# Pagination

Canonical primitive: `pagination`.

## Overview

<a id="overview"></a>

Pagination is the stable styled menu-navigation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `PaginationRoot` | `nav` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `list` | `PaginationList` | `ul` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `PaginationItem` | `li` | many | `number` | `value: number`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: number`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: number`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `pageTrigger` | `PaginationPageTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `previous` | `PaginationPrevious` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `next` | `PaginationNext` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `ellipsis` | `PaginationEllipsis` | `span` | many | `'start' | 'end'` | `value: 'start' | 'end'`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: 'start' | 'end'`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: 'start' | 'end'`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/pagination: createPaginationController(props, environment?)`
- State: `PaginationState`
- Actions: `PaginationActions`
- Parts: `PaginationController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability
- react context: `PaginationProvider and usePagination(inputs); adapter context remains private`
- svelte context: `PaginationProvider; adapter context remains private to compound descendants`
- solid context: `PaginationProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `first-page` (semantic)
- `middle-page` (semantic)
- `last-page` (semantic)

Complete transition signatures:

- `{ type: "FIRST" }` — Pagination semantic transition event FIRST. Source: controller-or-native-contract.
- `{ type: "PREVIOUS" }` — Pagination semantic transition event PREVIOUS. Source: controller-or-native-contract.
- `{ type: "NEXT" }` — Pagination semantic transition event NEXT. Source: controller-or-native-contract.
- `{ type: "LAST" }` — Pagination semantic transition event LAST. Source: controller-or-native-contract.
- `{ type: "GO_TO"; index: number }` — Pagination semantic transition event GO_TO. Source: controller-or-native-contract.

Controlled callbacks:

- `onPageChange(value: number) => void` — Called after Pagination requests a page change. Controlled consumers must commit the value back through page.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `page` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive page input from the canonical Pagination contract. |
| `defaultPage` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultPage input from the canonical Pagination contract. |
| `count` | `number` | yes | yes | `required` | Required reactive count input from the canonical Pagination contract. |
| `pageSize` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive pageSize input from the canonical Pagination contract. |
| `siblingCount` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive siblingCount input from the canonical Pagination contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Pagination contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `page`. Uncontrolled defaults: `defaultPage`. Change events: `PAGE_CHANGE`. Do not switch mode after mount.

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

Use the compound root `Pagination` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="pagination"` on all styled parts; stable.
- `data-uifn-part="root | list | item | pageTrigger | previous | next | ellipsis"` on all styled parts; stable.
- `data-state="idle | first-page | middle-page | last-page"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/pagination` | `components/uifn/react/pagination.ts` |
| svelte | `@uifn/components-svelte/pagination` | `components/uifn/svelte/pagination/index.ts` |
| solid | `@uifn/components-solid/pagination` | `components/uifn/solid/pagination.ts` |

#### React · package

```tsx
import * as React from 'react';
import { PaginationRoot } from '@uifn/components-react/pagination';

export function PaginationExample() {
  return React.createElement(PaginationRoot, {"count":1,"aria-label":"Pagination example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { PaginationRoot } from './components/uifn/react/pagination.js';

export function PaginationExample() {
  return React.createElement(PaginationRoot, {"count":1,"aria-label":"Pagination example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { PaginationRoot } from '@uifn/components-svelte/pagination';
</script>

<PaginationRoot count={1} aria-label="Pagination example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { PaginationRoot } from './components/uifn/svelte/pagination/index.js';
</script>

<PaginationRoot count={1} aria-label="Pagination example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { PaginationRoot } from '@uifn/components-solid/pagination';

export function PaginationExample() {
  return createComponent(PaginationRoot, {"count":1,"aria-label":"Pagination example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { PaginationRoot } from './components/uifn/solid/pagination.js';

export function PaginationExample() {
  return createComponent(PaginationRoot, {"count":1,"aria-label":"Pagination example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add pagination --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the menu-navigation profile specifically to Pagination; implementation vectors own exact behavior.
