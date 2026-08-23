# Breadcrumb

Canonical primitive: `breadcrumb`.

## Overview

<a id="overview"></a>

Breadcrumb is the stable styled static-foundation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `BreadcrumbRoot` | `nav` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `list` | `BreadcrumbList` | `ol` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `BreadcrumbItem` | `li` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `link` | `BreadcrumbLink` | `a` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `page` | `BreadcrumbPage` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `separator` | `BreadcrumbSeparator` | `li` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `ellipsis` | `BreadcrumbEllipsis` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/breadcrumb: BreadcrumbContract`
- State: `BreadcrumbState`
- Actions: `Record<string, never>`
- Parts: `BreadcrumbContractParts`
- DOM owner: Native elements own DOM behavior; @uifn/core remains DOM-free
- react context: `BreadcrumbProvider and useBreadcrumb(inputs); adapter context remains private`
- svelte context: `BreadcrumbProvider; adapter context remains private to compound descendants`
- solid context: `BreadcrumbProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `label` | `string` | no | yes | `undefined → "Breadcrumb"` | Optional reactive label input from the canonical Breadcrumb contract. |

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

Use the compound root `Breadcrumb` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="breadcrumb"` on all styled parts; stable.
- `data-uifn-part="root | list | item | link | page | separator | ellipsis"` on all styled parts; stable.
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
| react | `@uifn/components-react/breadcrumb` | `components/uifn/react/breadcrumb.ts` |
| svelte | `@uifn/components-svelte/breadcrumb` | `components/uifn/svelte/breadcrumb/BreadcrumbEllipsis.svelte` |
| solid | `@uifn/components-solid/breadcrumb` | `components/uifn/solid/breadcrumb.ts` |

#### React · package

```tsx
import * as React from 'react';
import { BreadcrumbRoot } from '@uifn/components-react/breadcrumb';

export function BreadcrumbExample() {
  return React.createElement(BreadcrumbRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { BreadcrumbRoot } from './components/uifn/react/breadcrumb.js';

export function BreadcrumbExample() {
  return React.createElement(BreadcrumbRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { BreadcrumbRoot } from '@uifn/components-svelte/breadcrumb';
</script>

<BreadcrumbRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { BreadcrumbRoot } from './components/uifn/svelte/breadcrumb/index.js';
</script>

<BreadcrumbRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { BreadcrumbRoot } from '@uifn/components-solid/breadcrumb';

export function BreadcrumbExample() {
  return createComponent(BreadcrumbRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { BreadcrumbRoot } from './components/uifn/solid/breadcrumb.js';

export function BreadcrumbExample() {
  return createComponent(BreadcrumbRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add breadcrumb --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Breadcrumb does not integrate with a router; consumers provide links and route transitions.
- Collapsed trails and responsive item omission remain application composition decisions.
- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- The root is a labelled navigation landmark and the current page uses aria-current="page".
- Separators are decorative and hidden from assistive technology.
