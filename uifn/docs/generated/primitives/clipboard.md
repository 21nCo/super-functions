# Clipboard

Canonical primitive: `clipboard`.

## Overview

<a id="overview"></a>

Clipboard is the stable styled status-feedback primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ClipboardRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `ClipboardTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `status` | `ClipboardStatus` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/clipboard: createClipboardController(props, environment?)`
- State: `ClipboardState`
- Actions: `ClipboardActions`
- Parts: `ClipboardController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `ClipboardProvider and useClipboard(inputs); adapter context remains private`
- svelte context: `ClipboardProvider; adapter context remains private to compound descendants`
- solid context: `ClipboardProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `pending` (semantic)
- `copied` (semantic)
- `error` (semantic)

Complete transition signatures:

- `{ type: "COPY" }` — Clipboard semantic transition event COPY. Source: controller-or-native-contract.
- `{ type: "COPY_SUCCESS" }` — Clipboard semantic transition event COPY_SUCCESS. Source: controller-or-native-contract.
- `{ type: "COPY_ERROR" }` — Clipboard semantic transition event COPY_ERROR. Source: controller-or-native-contract.
- `{ type: "RESET" }` — Clipboard semantic transition event RESET. Source: controller-or-native-contract.

Controlled callbacks:

- No controlled callback is declared; native element event props remain available.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Clipboard contract. |
| `timeout` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive timeout input from the canonical Clipboard contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Clipboard contract. |

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

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Clipboard` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="clipboard"` on all styled parts; stable.
- `data-uifn-part="root | trigger | status"` on all styled parts; stable.
- `data-state="idle | pending | copied | error"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/clipboard` | `components/uifn/react/clipboard.ts` |
| svelte | `@uifn/components-svelte/clipboard` | `components/uifn/svelte/clipboard/ClipboardRoot.svelte` |
| solid | `@uifn/components-solid/clipboard` | `components/uifn/solid/clipboard.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ClipboardRoot } from "@uifn/components-react/clipboard";

export function ClipboardExample() {
  return React.createElement(ClipboardRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ClipboardRoot } from "./components/uifn/react/clipboard.js";

export function ClipboardExample() {
  return React.createElement(ClipboardRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ClipboardRoot } from "@uifn/components-svelte/clipboard";
</script>

<ClipboardRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ClipboardRoot } from "./components/uifn/svelte/clipboard/index.js";
</script>

<ClipboardRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ClipboardRoot } from "@uifn/components-solid/clipboard";

export function ClipboardExample() {
  return createComponent(ClipboardRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ClipboardRoot } from "./components/uifn/solid/clipboard.js";

export function ClipboardExample() {
  return createComponent(ClipboardRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add clipboard --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Clipboard content is never serialized into traces or announcements.
