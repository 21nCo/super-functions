# Tour

Canonical primitive: `tour`.

## Overview

<a id="overview"></a>

Tour is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `TourRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `portal` | `TourPortal` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `backdrop` | `TourBackdrop` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `spotlight` | `TourSpotlight` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `TourPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `TourContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `title` | `TourTitle` | `heading` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `description` | `TourDescription` | `p` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `previous` | `TourPrevious` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `next` | `TourNext` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `skip` | `TourSkip` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `close` | `TourClose` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `progress` | `TourProgress` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/tour: createTourController(props, environment?)`
- State: `TourState`
- Actions: `TourActions`
- Parts: `TourController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions
- react context: `TourProvider and useTour(inputs); adapter context remains private`
- svelte context: `TourProvider; adapter context remains private to compound descendants`
- solid context: `TourProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `locating` (semantic)
- `open` (semantic)
- `transitioning` (semantic)
- `complete` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — Tour semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Tour semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "NEXT" }` — Tour semantic transition event NEXT. Source: controller-or-native-contract.
- `{ type: "PREVIOUS" }` — Tour semantic transition event PREVIOUS. Source: controller-or-native-contract.
- `{ type: "GO_TO"; index: number }` — Tour semantic transition event GO_TO. Source: controller-or-native-contract.
- `{ type: "SKIP" }` — Tour semantic transition event SKIP. Source: controller-or-native-contract.
- `{ type: "TARGET_MISSING" }` — Tour semantic transition event TARGET_MISSING. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after Tour requests a open change. Controlled consumers must commit the value back through open.
- `onStepChange(value: number) => void` — Called after Tour requests a step change. Controlled consumers must commit the value back through step.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical Tour contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical Tour contract. |
| `step` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive step input from the canonical Tour contract. |
| `defaultStep` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultStep input from the canonical Tour contract. |
| `steps` | `tour-step[]` | yes | yes | `required` | Required reactive steps input from the canonical Tour contract. |
| `modal` | `boolean` | no | yes | `undefined → true` | Optional reactive modal input from the canonical Tour contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `compound`. Controlled inputs: `open`, `step`. Uncontrolled defaults: `defaultOpen`, `defaultStep`. Change events: `OPEN_CHANGE`, `STEP_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `modal-overlay`. Native semantic basis: Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.

Accessible name required: yes; accepted sources: title-part, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.4.13, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11, 4.1.2. Normative basis: native-html, wai-aria-apg-dialog-modal, wai-aria-apg-tooltip. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `overlay-specific`; keys: `Tab`, `Shift+Tab`, `Escape`, `Enter`, `Space`. Pointer/touch obligations: trigger-activation, outside-interaction-by-declared-policy, touch-cancellation. Focus obligations: initial-focus, containment-when-modal, restore-focus, nested-scope-arbitration.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Tour` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="tour"` on all styled parts; stable.
- `data-uifn-part="root | portal | backdrop | spotlight | positioner | content | title | description | previous | next | skip | close | progress"` on all styled parts; stable.
- `data-state="closed | locating | open | transitioning | complete"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/tour` | `components/uifn/react/tour.ts` |
| svelte | `@uifn/components-svelte/tour` | `components/uifn/svelte/tour/index.ts` |
| solid | `@uifn/components-solid/tour` | `components/uifn/solid/tour.ts` |

#### React · package

```tsx
import * as React from 'react';
import { TourRoot } from '@uifn/components-react/tour';

export function TourExample() {
  return React.createElement(TourRoot, {"steps":[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]});
}
```

#### React · source

```tsx
import * as React from 'react';
import { TourRoot } from './components/uifn/react/tour.js';

export function TourExample() {
  return React.createElement(TourRoot, {"steps":[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { TourRoot } from '@uifn/components-svelte/tour';
</script>

<TourRoot steps={[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]} />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { TourRoot } from './components/uifn/svelte/tour/index.js';
</script>

<TourRoot steps={[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]} />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { TourRoot } from '@uifn/components-solid/tour';

export function TourExample() {
  return createComponent(TourRoot, {"steps":[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { TourRoot } from './components/uifn/solid/tour.js';

export function TourExample() {
  return createComponent(TourRoot, {"steps":[{"id":"intro","title":"Introduction","target":"#uifn-tour-target"}]});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add tour --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to Tour; implementation vectors own exact behavior.
