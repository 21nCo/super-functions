# Progress

Canonical primitive: `progress`.

## Overview

<a id="overview"></a>

Progress is the stable styled status-feedback primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ProgressRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `ProgressLabel` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `track` | `ProgressTrack` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `range` | `ProgressRange` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `circle` | `ProgressCircle` | `svg` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `valueText` | `ProgressValueText` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/progress: ProgressContract`
- State: `ProgressState`
- Actions: `Record<string, never>`
- Parts: `ProgressContractParts`
- DOM owner: @uifn/dom owns form-bridges-live-regions
- react context: `ProgressProvider and useProgress(inputs); adapter context remains private`
- svelte context: `ProgressProvider; adapter context remains private to compound descendants`
- solid context: `ProgressProvider; adapter context remains private to compound descendants`

States:

- `indeterminate` (semantic)
- `loading` (semantic)
- `complete` (semantic)
- `error` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `number` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Progress contract. |
| `min` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive min input from the canonical Progress contract. |
| `max` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive max input from the canonical Progress contract. |
| `indeterminate` | `boolean` | no | yes | `undefined → false` | Optional reactive indeterminate input from the canonical Progress contract. |
| `formatValue` | `value-formatter` | no | yes | `undefined (no public prop override)` | Optional reactive formatValue input from the canonical Progress contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `native`. Controlled inputs: `value`. Uncontrolled defaults: none. Change events: `NATIVE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `status-feedback`. Native semantic basis: Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.

Accessible name required: yes; accepted sources: visible-label, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.2.1, 2.4.3, 3.2.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-live-regions. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-or-workflow-specific`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`. Pointer/touch obligations: action-activation-where-interactive, swipe-with-keyboard-alternative-where-applicable. Focus obligations: do-not-steal-focus-for-passive-status, restore-focus-for-dismissed-workflow.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Progress` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="progress"` on all styled parts; stable.
- `data-uifn-part="root | label | track | range | circle | valueText"` on all styled parts; stable.
- `data-state="indeterminate | loading | complete | error"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/progress` | `components/uifn/react/progress.ts` |
| svelte | `@uifn/components-svelte/progress` | `components/uifn/svelte/progress/index.ts` |
| solid | `@uifn/components-solid/progress` | `components/uifn/solid/progress.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ProgressRoot } from "@uifn/components-react/progress";

export function ProgressExample() {
  return React.createElement(ProgressRoot, {"aria-label":"Progress example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ProgressRoot } from "./components/uifn/react/progress.js";

export function ProgressExample() {
  return React.createElement(ProgressRoot, {"aria-label":"Progress example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ProgressRoot } from "@uifn/components-svelte/progress";
</script>

<ProgressRoot aria-label="Progress example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ProgressRoot } from "./components/uifn/svelte/progress/index.js";
</script>

<ProgressRoot aria-label="Progress example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ProgressRoot } from "@uifn/components-solid/progress";

export function ProgressExample() {
  return createComponent(ProgressRoot, {"aria-label":"Progress example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ProgressRoot } from "./components/uifn/solid/progress.js";

export function ProgressExample() {
  return createComponent(ProgressRoot, {"aria-label":"Progress example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add progress --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- Apply the status-feedback profile specifically to Progress; implementation vectors own exact behavior.
