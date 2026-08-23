# Dialog

Canonical primitive: `dialog`.

## Overview

<a id="overview"></a>

Dialog is the stable styled modal-overlay primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `DialogRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `DialogTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `portal` | `DialogPortal` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `backdrop` | `DialogBackdrop` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `positioner` | `DialogPositioner` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `DialogContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `title` | `DialogTitle` | `heading` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `description` | `DialogDescription` | `p` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `close` | `DialogClose` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/dialog: createDialogController(props, environment?)`
- State: `DialogState`
- Actions: `DialogActions`
- Parts: `DialogController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions
- react context: `DialogProvider and useDialog(inputs); adapter context remains private`
- svelte context: `DialogProvider; adapter context remains private to compound descendants`
- solid context: `DialogProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `opening` (semantic)
- `open` (semantic)
- `closing` (semantic)

Complete transition signatures:

- `{ type: "OPEN"; reason?: string }` — Dialog semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Dialog semantic transition event CLOSE. Source: controller-or-native-contract.
- `{ type: "ESCAPE" }` — Dialog semantic transition event ESCAPE. Source: controller-or-native-contract.
- `{ type: "INTERACT_OUTSIDE" }` — Dialog semantic transition event INTERACT_OUTSIDE. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after Dialog requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical Dialog contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical Dialog contract. |
| `modal` | `boolean` | no | yes | `undefined → true` | Optional reactive modal input from the canonical Dialog contract. |
| `initialFocus` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive initialFocus input from the canonical Dialog contract. |
| `restoreFocus` | `boolean` | no | yes | `undefined → true` | Optional reactive restoreFocus input from the canonical Dialog contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `open`. Uncontrolled defaults: `defaultOpen`. Change events: `OPEN_CHANGE`. Do not switch mode after mount.

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, dismissable-layer, focus-scope, modal-isolation-scroll-lock, positioning-auto-update, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Dialog` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="dialog"` on all styled parts; stable.
- `data-uifn-part="root | trigger | portal | backdrop | positioner | content | title | description | close"` on all styled parts; stable.
- `data-state="closed | opening | open | closing"` on stateful parts; stable semantic state.

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
- `--uifn-component-shadow-overlay` (shared)
- `--uifn-control-block-size` (shared)
- `--uifn-control-gap` (shared)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/dialog` | `components/uifn/react/dialog.ts` |
| svelte | `@uifn/components-svelte/dialog` | `components/uifn/svelte/dialog/DialogBackdrop.svelte` |
| solid | `@uifn/components-solid/dialog` | `components/uifn/solid/dialog.ts` |

#### React · package

```tsx
import * as React from 'react';
import { DialogRoot } from '@uifn/components-react/dialog';

export function DialogExample() {
  return React.createElement(DialogRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { DialogRoot } from './components/uifn/react/dialog.js';

export function DialogExample() {
  return React.createElement(DialogRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { DialogRoot } from '@uifn/components-svelte/dialog';
</script>

<DialogRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { DialogRoot } from './components/uifn/svelte/dialog/index.js';
</script>

<DialogRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { DialogRoot } from '@uifn/components-solid/dialog';

export function DialogExample() {
  return createComponent(DialogRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { DialogRoot } from './components/uifn/solid/dialog.js';

export function DialogExample() {
  return createComponent(DialogRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add dialog --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the modal-overlay profile specifically to Dialog; implementation vectors own exact behavior.
