# Toggle

Canonical primitive: `toggle`.

## Overview

<a id="overview"></a>

Toggle is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `ToggleRoot` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/toggle: createToggleController(props, environment?)`
- State: `ToggleState`
- Actions: `ToggleActions`
- Parts: `ToggleController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability
- react context: `ToggleProvider and useToggle(inputs); adapter context remains private`
- svelte context: `ToggleProvider; adapter context remains private to compound descendants`
- solid context: `ToggleProvider; adapter context remains private to compound descendants`

States:

- `off` (semantic)
- `on` (semantic)

Complete transition signatures:

- `{ type: "TOGGLE"; key?: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Toggle semantic transition event TOGGLE. Source: controller-or-native-contract.
- `{ type: "SET_PRESSED"; pressed: boolean }` — Toggle semantic transition event SET_PRESSED. Source: controller-or-native-contract.

Controlled callbacks:

- `onPressedChange(value: boolean) => void` — Called after Toggle requests a pressed change. Controlled consumers must commit the value back through pressed.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `pressed` | `boolean` | no | yes | `undefined → false` | Optional reactive pressed input from the canonical Toggle contract. |
| `defaultPressed` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultPressed input from the canonical Toggle contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Toggle contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `pressed`. Uncontrolled defaults: `defaultPressed`. Change events: `PRESSED_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `selection-collection`. Native semantic basis: Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-listbox, wai-aria-apg-combobox, wai-aria-apg-radio. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `selection-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: select-item, toggle-item, touch-scroll-arbitration. Focus obligations: active-item, selected-item, dynamic-collection-focus-repair.

## Forms

<a id="forms"></a>

Participation: `none`; value shape: `none`; reset: `none`; validation: `none`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Toggle` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="toggle"` on all styled parts; stable.
- `data-uifn-part="root"` on all styled parts; stable.
- `data-state="off | on"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/toggle` | `components/uifn/react/toggle.ts` |
| svelte | `@uifn/components-svelte/toggle` | `components/uifn/svelte/toggle/index.ts` |
| solid | `@uifn/components-solid/toggle` | `components/uifn/solid/toggle.ts` |

#### React · package

```tsx
import * as React from 'react';
import { ToggleRoot } from '@uifn/components-react/toggle';

export function ToggleExample() {
  return React.createElement(ToggleRoot, {"aria-label":"Toggle example"});
}
```

#### React · source

```tsx
import * as React from 'react';
import { ToggleRoot } from './components/uifn/react/toggle.js';

export function ToggleExample() {
  return React.createElement(ToggleRoot, {"aria-label":"Toggle example"});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { ToggleRoot } from '@uifn/components-svelte/toggle';
</script>

<ToggleRoot aria-label="Toggle example" />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { ToggleRoot } from './components/uifn/svelte/toggle/index.js';
</script>

<ToggleRoot aria-label="Toggle example" />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { ToggleRoot } from '@uifn/components-solid/toggle';

export function ToggleExample() {
  return createComponent(ToggleRoot, {"aria-label":"Toggle example"});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { ToggleRoot } from './components/uifn/solid/toggle.js';

export function ToggleExample() {
  return createComponent(ToggleRoot, {"aria-label":"Toggle example"});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add toggle --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the selection-collection profile specifically to Toggle; implementation vectors own exact behavior.
