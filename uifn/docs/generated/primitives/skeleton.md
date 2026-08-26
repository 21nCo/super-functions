# Skeleton

Canonical primitive: `skeleton`.

## Overview

<a id="overview"></a>

Skeleton is the stable styled status-feedback primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SkeletonRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/skeleton: SkeletonContract`
- State: `SkeletonState`
- Actions: `Record<string, never>`
- Parts: `SkeletonContractParts`
- DOM owner: Native elements own DOM behavior; @uifn/core remains DOM-free
- react context: `SkeletonProvider and useSkeleton(inputs); adapter context remains private`
- svelte context: `SkeletonProvider; adapter context remains private to compound descendants`
- solid context: `SkeletonProvider; adapter context remains private to compound descendants`

States:

- `loading` (semantic)
- `hidden` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `visible` | `boolean` | no | yes | `undefined → true` | Optional reactive visible input from the canonical Skeleton contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `none`. Controlled inputs: none. Uncontrolled defaults: none. Change events: native events only. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (none) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Skeleton` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="skeleton"` on all styled parts; stable.
- `data-uifn-part="root"` on all styled parts; stable.
- `data-state="loading | hidden"` on stateful parts; stable semantic state.

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
- `--uifn-skeleton-base` (component)
- `--uifn-skeleton-highlight` (component)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/skeleton` | `components/uifn/react/skeleton.ts` |
| svelte | `@uifn/components-svelte/skeleton` | `components/uifn/svelte/skeleton/index.ts` |
| solid | `@uifn/components-solid/skeleton` | `components/uifn/solid/skeleton.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SkeletonRoot } from "@uifn/components-react/skeleton";

export function SkeletonExample() {
  return React.createElement(SkeletonRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SkeletonRoot } from "./components/uifn/react/skeleton.js";

export function SkeletonExample() {
  return React.createElement(SkeletonRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SkeletonRoot } from "@uifn/components-svelte/skeleton";
</script>

<SkeletonRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SkeletonRoot } from "./components/uifn/svelte/skeleton/index.js";
</script>

<SkeletonRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SkeletonRoot } from "@uifn/components-solid/skeleton";

export function SkeletonExample() {
  return createComponent(SkeletonRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SkeletonRoot } from "./components/uifn/solid/skeleton.js";

export function SkeletonExample() {
  return createComponent(SkeletonRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add skeleton --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Skeleton is decorative and does not announce loading. Apply aria-busy to the owning content region when an announcement is required.
- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- Skeleton geometry is decorative and hidden from the accessibility tree.
- The owning content region is responsible for announcing busy state when appropriate.
