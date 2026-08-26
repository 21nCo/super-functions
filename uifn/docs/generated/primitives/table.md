# Table

Canonical primitive: `table`.

## Overview

<a id="overview"></a>

Table is the stable styled static-foundation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `TableRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `table` | `TableTable` | `table` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `header` | `TableHeader` | `thead` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `body` | `TableBody` | `tbody` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `footer` | `TableFooter` | `tfoot` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `row` | `TableRow` | `tr` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `head` | `TableHead` | `th` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `cell` | `TableCell` | `td` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `caption` | `TableCaption` | `caption` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/table: TableContract`
- State: `TableState`
- Actions: `Record<string, never>`
- Parts: `TableContractParts`
- DOM owner: Native elements own DOM behavior; @uifn/core remains DOM-free
- react context: `TableProvider and useTable(inputs); adapter context remains private`
- svelte context: `TableProvider; adapter context remains private to compound descendants`
- solid context: `TableProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `striped` | `boolean` | no | yes | `undefined → false` | Optional reactive striped input from the canonical Table contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `none`. Controlled inputs: none. Uncontrolled defaults: none. Change events: native events only. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `static-foundation`. Native semantic basis: Use the strongest native element and avoid adding widget roles or subscriptions to static content.

Accessible name required: no; accepted sources: native-text, alt, aria-label, aria-labelledby. WCAG mapping: 1.1.1, 1.3.1, 1.4.1, 2.1.1, 2.4.7, 4.1.2. Normative basis: native-html. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-only`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`. Pointer/touch obligations: native-activation-where-interactive. Focus obligations: native-focus-only, visible-focus-where-focusable.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (none) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Table` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="table"` on all styled parts; stable.
- `data-uifn-part="root | table | header | body | footer | row | head | cell | caption"` on all styled parts; stable.
- `data-state="idle"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/table` | `components/uifn/react/table.ts` |
| svelte | `@uifn/components-svelte/table` | `components/uifn/svelte/table/index.ts` |
| solid | `@uifn/components-solid/table` | `components/uifn/solid/table.ts` |

#### React · package

```tsx
import * as React from 'react';
import { TableRoot } from "@uifn/components-react/table";

export function TableExample() {
  return React.createElement(TableRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { TableRoot } from "./components/uifn/react/table.js";

export function TableExample() {
  return React.createElement(TableRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { TableRoot } from "@uifn/components-svelte/table";
</script>

<TableRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { TableRoot } from "./components/uifn/svelte/table/index.js";
</script>

<TableRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { TableRoot } from "@uifn/components-solid/table";

export function TableExample() {
  return createComponent(TableRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { TableRoot } from "./components/uifn/solid/table.js";

export function TableExample() {
  return createComponent(TableRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add table --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Table preserves semantic structure but does not implement sorting, filtering, pagination, selection, or virtualization.
- Consumers must provide meaningful headers and a caption or external accessible name.
- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- The semantic table, sections, rows, header cells, data cells, and caption are preserved.
- Consumers must provide meaningful column headers and a caption or external accessible name.
