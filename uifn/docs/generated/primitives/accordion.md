# Accordion

Canonical primitive: `accordion`.

## Overview

<a id="overview"></a>

Accordion is the stable styled disclosure primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `AccordionRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `AccordionItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `header` | `AccordionHeader` | `heading` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `AccordionTrigger` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `content` | `AccordionContent` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `indicator` | `AccordionIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/accordion: createAccordionController(props, environment?)`
- State: `AccordionState`
- Actions: `AccordionActions`
- Parts: `AccordionController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, portal-presence-transitions
- react context: `AccordionProvider and useAccordion(inputs); adapter context remains private`
- svelte context: `AccordionProvider; adapter context remains private to compound descendants`
- solid context: `AccordionProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `expanded` (semantic)

Complete transition signatures:

- `{ type: "TOGGLE"; key?: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Accordion semantic transition event TOGGLE. Source: controller-or-native-contract.
- `{ type: "SET_VALUE"; value: string[] }` — Accordion semantic transition event SET_VALUE. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: string[]) => void` — Called after Accordion requests a value change. Controlled consumers must commit the value back through value.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `string[]` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Accordion contract. |
| `defaultValue` | `string[]` | no | yes | `undefined → []` | Optional reactive defaultValue input from the canonical Accordion contract. |
| `multiple` | `boolean` | no | yes | `undefined → false` | Optional reactive multiple input from the canonical Accordion contract. |
| `collapsible` | `boolean` | no | yes | `undefined → false` | Optional reactive collapsible input from the canonical Accordion contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Accordion contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `multiple`. Controlled inputs: `value`. Uncontrolled defaults: `defaultValue`. Change events: `VALUE_CHANGE`. Do not switch mode after mount.

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

Use the compound root `Accordion` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="accordion"` on all styled parts; stable.
- `data-uifn-part="root | item | header | trigger | content | indicator"` on all styled parts; stable.
- `data-state="idle | expanded"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/accordion` | `components/uifn/react/accordion.ts` |
| svelte | `@uifn/components-svelte/accordion` | `components/uifn/svelte/accordion/AccordionContent.svelte` |
| solid | `@uifn/components-solid/accordion` | `components/uifn/solid/accordion.ts` |

#### React · package

```tsx
import * as React from 'react';
import { AccordionRoot } from '@uifn/components-react/accordion';

export function AccordionExample() {
  return React.createElement(AccordionRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { AccordionRoot } from './components/uifn/react/accordion.js';

export function AccordionExample() {
  return React.createElement(AccordionRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { AccordionRoot } from '@uifn/components-svelte/accordion';
</script>

<AccordionRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { AccordionRoot } from './components/uifn/svelte/accordion/index.js';
</script>

<AccordionRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { AccordionRoot } from '@uifn/components-solid/accordion';

export function AccordionExample() {
  return createComponent(AccordionRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { AccordionRoot } from './components/uifn/solid/accordion.js';

export function AccordionExample() {
  return createComponent(AccordionRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add accordion --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the disclosure profile specifically to Accordion; implementation vectors own exact behavior.
