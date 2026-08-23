# Timer

Canonical primitive: `timer`.

## Overview

<a id="overview"></a>

Timer is the stable styled status-feedback primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `TimerRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `value` | `TimerValue` | `time` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `start` | `TimerStart` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `pause` | `TimerPause` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `reset` | `TimerReset` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `status` | `TimerStatus` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/timer: createTimerController(props, environment?)`
- State: `TimerState`
- Actions: `TimerActions`
- Parts: `TimerController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `TimerProvider and useTimer(inputs); adapter context remains private`
- svelte context: `TimerProvider; adapter context remains private to compound descendants`
- solid context: `TimerProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `running` (semantic)
- `paused` (semantic)
- `complete` (semantic)

Complete transition signatures:

- `{ type: "START" }` — Timer semantic transition event START. Source: controller-or-native-contract.
- `{ type: "PAUSE" }` — Timer semantic transition event PAUSE. Source: controller-or-native-contract.
- `{ type: "RESUME" }` — Timer semantic transition event RESUME. Source: controller-or-native-contract.
- `{ type: "RESET" }` — Timer semantic transition event RESET. Source: controller-or-native-contract.
- `{ type: "TICK" }` — Timer semantic transition event TICK. Source: controller-or-native-contract.
- `{ type: "VISIBILITY_CHANGE" }` — Timer semantic transition event VISIBILITY_CHANGE. Source: controller-or-native-contract.

Controlled callbacks:

- `onRemainingChange(value: number) => void` — Called after Timer requests a remaining change. Controlled consumers must commit the value back through remaining.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `duration` | `number` | yes | yes | `required` | Required reactive duration input from the canonical Timer contract. |
| `remaining` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive remaining input from the canonical Timer contract. |
| `defaultRemaining` | `number` | no | yes | `undefined (component initial value)` | Optional reactive defaultRemaining input from the canonical Timer contract. |
| `direction` | `string` | no | yes | `undefined → "ltr"` | Optional reactive direction input from the canonical Timer contract. |
| `autoStart` | `boolean` | no | yes | `undefined → false` | Optional reactive autoStart input from the canonical Timer contract. |
| `announceInterval` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive announceInterval input from the canonical Timer contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `remaining`. Uncontrolled defaults: `defaultRemaining`. Change events: `REMAINING_CHANGE`. Do not switch mode after mount.

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

Use the compound root `Timer` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="timer"` on all styled parts; stable.
- `data-uifn-part="root | value | start | pause | reset | status"` on all styled parts; stable.
- `data-state="idle | running | paused | complete"` on stateful parts; stable semantic state.

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
| react | `@uifn/components-react/timer` | `components/uifn/react/timer.ts` |
| svelte | `@uifn/components-svelte/timer` | `components/uifn/svelte/timer/index.ts` |
| solid | `@uifn/components-solid/timer` | `components/uifn/solid/timer.ts` |

#### React · package

```tsx
import * as React from 'react';
import { TimerRoot } from '@uifn/components-react/timer';

export function TimerExample() {
  return React.createElement(TimerRoot, {"duration":1,"aria-label":"Timer example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { TimerRoot } from './components/uifn/react/timer.js';

export function TimerExample() {
  return React.createElement(TimerRoot, {"duration":1,"aria-label":"Timer example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { TimerRoot } from '@uifn/components-svelte/timer';
</script>

<TimerRoot duration={1} aria-label="Timer example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { TimerRoot } from './components/uifn/svelte/timer/index.js';
</script>

<TimerRoot duration={1} aria-label="Timer example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { TimerRoot } from '@uifn/components-solid/timer';

export function TimerExample() {
  return createComponent(TimerRoot, {"duration":1,"aria-label":"Timer example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { TimerRoot } from './components/uifn/solid/timer.js';

export function TimerExample() {
  return createComponent(TimerRoot, {"duration":1,"aria-label":"Timer example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add timer --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the status-feedback profile specifically to Timer; implementation vectors own exact behavior.
