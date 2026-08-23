# Separator

Canonical primitive: `separator`.

## Overview

<a id="overview"></a>

Separator is the stable styled static-foundation primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `typed-static-contract`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SeparatorRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/separator: SeparatorContract`
- State: `SeparatorState`
- Actions: `Record<string, never>`
- Parts: `SeparatorContractParts`
- DOM owner: Native elements own DOM behavior; @uifn/core remains DOM-free
- react context: `SeparatorProvider and useSeparator(inputs); adapter context remains private`
- svelte context: `SeparatorProvider; adapter context remains private to compound descendants`
- solid context: `SeparatorProvider; adapter context remains private to compound descendants`

States:

- `ready` (semantic)

Complete transition signatures:

- No controller event is declared; native element event props remain available.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Separator contract. |
| `decorative` | `boolean` | no | yes | `undefined → false` | Optional reactive decorative input from the canonical Separator contract. |

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

Use the compound root `Separator` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="separator"` on all styled parts; stable.
- `data-uifn-part="root"` on all styled parts; stable.
- `data-state="ready"` on stateful parts; stable semantic state.
- `data-orientation="string"` on parts whose semantics depend on this input; stable semantic state.

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
| react | `@uifn/components-react/separator` | `components/uifn/react/separator.ts` |
| svelte | `@uifn/components-svelte/separator` | `components/uifn/svelte/separator/index.ts` |
| solid | `@uifn/components-solid/separator` | `components/uifn/solid/separator.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SeparatorRoot } from '@uifn/components-react/separator';

export function SeparatorExample() {
  return React.createElement(SeparatorRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SeparatorRoot } from './components/uifn/react/separator.js';

export function SeparatorExample() {
  return React.createElement(SeparatorRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SeparatorRoot } from '@uifn/components-svelte/separator';
</script>

<SeparatorRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SeparatorRoot } from './components/uifn/svelte/separator/index.js';
</script>

<SeparatorRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SeparatorRoot } from '@uifn/components-solid/separator';

export function SeparatorExample() {
  return createComponent(SeparatorRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SeparatorRoot } from './components/uifn/solid/separator.js';

export function SeparatorExample() {
  return createComponent(SeparatorRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add separator --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- This typed static contract exposes semantic state and parts but no controller subscription or action surface.
- Apply the static-foundation profile specifically to Separator; implementation vectors own exact behavior.
