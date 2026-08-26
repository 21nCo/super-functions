# Switch

Canonical primitive: `switch`.

## Overview

<a id="overview"></a>

Switch is the stable styled forms-input primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `SwitchRoot` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `control` | `SwitchControl` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `thumb` | `SwitchThumb` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `SwitchLabel` | `span` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `SwitchHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/switch: createSwitchController(props, environment?)`
- State: `SwitchState`
- Actions: `SwitchActions`
- Parts: `SwitchController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `SwitchProvider and useSwitch(inputs); adapter context remains private`
- svelte context: `SwitchProvider; adapter context remains private to compound descendants`
- solid context: `SwitchProvider; adapter context remains private to compound descendants`

States:

- `unchecked` (semantic)
- `checked` (semantic)

Complete transition signatures:

- `{ type: "TOGGLE"; key?: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Switch semantic transition event TOGGLE. Source: controller-or-native-contract.
- `{ type: "SET_CHECKED"; checked: boolean | "indeterminate" }` — Switch semantic transition event SET_CHECKED. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — Switch semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onCheckedChange(value: boolean) => void` — Called after Switch requests a checked change. Controlled consumers must commit the value back through checked.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `checked` | `boolean` | no | yes | `undefined → false` | Optional reactive checked input from the canonical Switch contract. |
| `defaultChecked` | `boolean` | no | yes | `undefined → false` | Optional reactive defaultChecked input from the canonical Switch contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical Switch contract. |
| `value` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Switch contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Switch contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical Switch contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical Switch contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `single`. Controlled inputs: `checked`. Uncontrolled defaults: `defaultChecked`. Change events: `CHECKED_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `forms-input`. Native semantic basis: Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.3.1, 3.3.2, 3.3.3, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-spinbutton. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-input-plus-declared-enhancements`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `composition`. Pointer/touch obligations: native-control-interaction, target-size, file-picker-where-applicable. Focus obligations: visible-input-focus, error-focus-policy, caret-and-selection-preservation.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `scalar`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Switch` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="switch"` on all styled parts; stable.
- `data-uifn-part="root | control | thumb | label | hiddenInput"` on all styled parts; stable.
- `data-state="unchecked | checked"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-readonly="true | false"` on parts whose semantics depend on this input; stable semantic state.

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
- `--uifn-motion-duration-fast` (shared)

## Package install

<a id="package-install"></a>

Published package version: `0.0.1`; canonical catalog version: `stable-1.0`.

| Framework | Public import | Source-install target |
|---|---|---|
| react | `@uifn/components-react/switch` | `components/uifn/react/switch.ts` |
| svelte | `@uifn/components-svelte/switch` | `components/uifn/svelte/switch/index.ts` |
| solid | `@uifn/components-solid/switch` | `components/uifn/solid/switch.ts` |

#### React · package

```tsx
import * as React from 'react';
import { SwitchRoot } from "@uifn/components-react/switch";

export function SwitchExample() {
  return React.createElement(SwitchRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { SwitchRoot } from "./components/uifn/react/switch.js";

export function SwitchExample() {
  return React.createElement(SwitchRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { SwitchRoot } from "@uifn/components-svelte/switch";
</script>

<SwitchRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { SwitchRoot } from "./components/uifn/svelte/switch/index.js";
</script>

<SwitchRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { SwitchRoot } from "@uifn/components-solid/switch";

export function SwitchExample() {
  return createComponent(SwitchRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { SwitchRoot } from "./components/uifn/solid/switch.js";

export function SwitchExample() {
  return createComponent(SwitchRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add switch --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- Apply the forms-input profile specifically to Switch; implementation vectors own exact behavior.
