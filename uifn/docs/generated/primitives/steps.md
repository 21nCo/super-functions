# Steps

Canonical primitive: `steps`.

## Overview

<a id="overview"></a>

Steps is the stable styled status-feedback primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `StepsRoot` | `nav` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `list` | `StepsList` | `ol` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `StepsItem` | `li` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `StepsTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `StepsIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `separator` | `StepsSeparator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `StepsContent` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `completed` | `StepsCompleted` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/steps: createStepsController(props, environment?)`
- State: `StepsState`
- Actions: `StepsActions`
- Parts: `StepsController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `StepsProvider and useSteps(inputs); adapter context remains private`
- svelte context: `StepsProvider; adapter context remains private to compound descendants`
- solid context: `StepsProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `in-progress` (semantic)
- `complete` (semantic)

Complete transition signatures:

- `{ type: "NEXT" }` — Steps semantic transition event NEXT. Source: controller-or-native-contract.
- `{ type: "PREVIOUS" }` — Steps semantic transition event PREVIOUS. Source: controller-or-native-contract.
- `{ type: "GO_TO"; index: number }` — Steps semantic transition event GO_TO. Source: controller-or-native-contract.
- `{ type: "COMPLETE" }` — Steps semantic transition event COMPLETE. Source: controller-or-native-contract.

Controlled callbacks:

- `onStepChange(value: number) => void` — Called after Steps requests a step change. Controlled consumers must commit the value back through step.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `step` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive step input from the canonical Steps contract. |
| `defaultStep` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultStep input from the canonical Steps contract. |
| `count` | `number` | yes | yes | `required` | Required reactive count input from the canonical Steps contract. |
| `orientation` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive orientation input from the canonical Steps contract. |
| `linear` | `boolean` | no | yes | `undefined → false` | Optional reactive linear input from the canonical Steps contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `step`. Uncontrolled defaults: `defaultStep`. Change events: `STEP_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Steps` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="steps"` on all styled parts; stable.
- `data-uifn-part="root | list | item | trigger | indicator | separator | content | completed"` on all styled parts; stable.
- `data-state="idle | in-progress | complete"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/steps` | `components/uifn/react/steps.ts` |
| svelte | `@uifn/components-svelte/steps` | `components/uifn/svelte/steps/index.ts` |
| solid | `@uifn/components-solid/steps` | `components/uifn/solid/steps.ts` |

#### React · package

```tsx
import * as React from 'react';
import { StepsRoot } from "@uifn/components-react/steps";

export function StepsExample() {
  return React.createElement(StepsRoot, {"count":1,"aria-label":"Steps example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { StepsRoot } from "./components/uifn/react/steps.js";

export function StepsExample() {
  return React.createElement(StepsRoot, {"count":1,"aria-label":"Steps example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { StepsRoot } from "@uifn/components-svelte/steps";
</script>

<StepsRoot count={1} aria-label="Steps example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { StepsRoot } from "./components/uifn/svelte/steps/index.js";
</script>

<StepsRoot count={1} aria-label="Steps example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { StepsRoot } from "@uifn/components-solid/steps";

export function StepsExample() {
  return createComponent(StepsRoot, {"count":1,"aria-label":"Steps example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { StepsRoot } from "./components/uifn/solid/steps.js";

export function StepsExample() {
  return createComponent(StepsRoot, {"count":1,"aria-label":"Steps example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add steps --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the status-feedback profile specifically to Steps; implementation vectors own exact behavior.
