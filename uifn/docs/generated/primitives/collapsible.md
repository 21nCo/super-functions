# Collapsible

Canonical primitive: `collapsible`.

## Overview

<a id="overview"></a>

Collapsible is the stable styled disclosure primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `CollapsibleRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `CollapsibleTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `CollapsibleContent` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/collapsible: createCollapsibleController(props, environment?)`
- State: `CollapsibleState`
- Actions: `CollapsibleActions`
- Parts: `CollapsibleController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, portal-presence-transitions
- react context: `CollapsibleProvider and useCollapsible(inputs); adapter context remains private`
- svelte context: `CollapsibleProvider; adapter context remains private to compound descendants`
- solid context: `CollapsibleProvider; adapter context remains private to compound descendants`

States:

- `closed` (semantic)
- `opening` (semantic)
- `open` (semantic)
- `closing` (semantic)

Complete transition signatures:

- `{ type: "TOGGLE"; key?: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Collapsible semantic transition event TOGGLE. Source: controller-or-native-contract.
- `{ type: "OPEN"; reason?: string }` — Collapsible semantic transition event OPEN. Source: controller-or-native-contract.
- `{ type: "CLOSE"; reason?: string }` — Collapsible semantic transition event CLOSE. Source: controller-or-native-contract.

Controlled callbacks:

- `onOpenChange(value: boolean) => void` — Called after Collapsible requests a open change. Controlled consumers must commit the value back through open.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `open` | `boolean` | no | yes | `undefined → false` | Optional reactive open input from the canonical Collapsible contract. |
| `defaultOpen` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultOpen input from the canonical Collapsible contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Collapsible contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `open`. Uncontrolled defaults: `defaultOpen`. Change events: `OPEN_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `disclosure`. Native semantic basis: Use a native button for each trigger and a related region only when the content warrants a landmark.

Accessible name required: yes; accepted sources: trigger-text, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 4.1.2. Normative basis: native-html, wai-aria-apg-disclosure. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `disclosure`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowDown`, `ArrowUp`, `Home`, `End`. Pointer/touch obligations: activate-trigger, preserve-native-click-semantics. Focus obligations: visible-trigger-focus, no-focus-loss-on-collapse.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, portal-presence-transitions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Collapsible` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="collapsible"` on all styled parts; stable.
- `data-uifn-part="root | trigger | content"` on all styled parts; stable.
- `data-state="closed | opening | open | closing"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/collapsible` | `components/uifn/react/collapsible.ts` |
| svelte | `@uifn/components-svelte/collapsible` | `components/uifn/svelte/collapsible/CollapsibleContent.svelte` |
| solid | `@uifn/components-solid/collapsible` | `components/uifn/solid/collapsible.ts` |

#### React · package

```tsx
import * as React from 'react';
import { CollapsibleRoot } from "@uifn/components-react/collapsible";

export function CollapsibleExample() {
  return React.createElement(CollapsibleRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { CollapsibleRoot } from "./components/uifn/react/collapsible.js";

export function CollapsibleExample() {
  return React.createElement(CollapsibleRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { CollapsibleRoot } from "@uifn/components-svelte/collapsible";
</script>

<CollapsibleRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { CollapsibleRoot } from "./components/uifn/svelte/collapsible/index.js";
</script>

<CollapsibleRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { CollapsibleRoot } from "@uifn/components-solid/collapsible";

export function CollapsibleExample() {
  return createComponent(CollapsibleRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { CollapsibleRoot } from "./components/uifn/solid/collapsible.js";

export function CollapsibleExample() {
  return createComponent(CollapsibleRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add collapsible --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the disclosure profile specifically to Collapsible; implementation vectors own exact behavior.
