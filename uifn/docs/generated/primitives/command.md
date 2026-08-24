# Command

Canonical primitive: `command`.

## Overview

<a id="overview"></a>

Command is the stable styled selection-collection primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `CommandRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `CommandLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `input` | `CommandInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `list` | `CommandList` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `empty` | `CommandEmpty` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `loading` | `CommandLoading` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `group` | `CommandGroup` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `groupHeading` | `CommandGroupHeading` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `CommandItem` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemIndicator` | `CommandItemIndicator` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `separator` | `CommandSeparator` | `div` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `shortcut` | `CommandShortcut` | `kbd` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `hiddenInput` | `CommandHiddenInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/command: createCommandController(props, environment?)`
- State: `CommandState`
- Actions: `CommandActions`
- Parts: `CommandController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `CommandProvider and useCommand(inputs); adapter context remains private`
- svelte context: `CommandProvider; adapter context remains private to compound descendants`
- solid context: `CommandProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `composing` (semantic)
- `loading` (semantic)
- `empty` (semantic)
- `selected` (semantic)

Complete transition signatures:

- `{ type: "INPUT"; value: string }` — Command semantic transition event INPUT. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_START" }` — Command semantic transition event COMPOSITION_START. Source: controller-or-native-contract.
- `{ type: "COMPOSITION_END"; value: string }` — Command semantic transition event COMPOSITION_END. Source: controller-or-native-contract.
- `{ type: "NAVIGATE"; key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight" | "Home" | "End" }` — Command semantic transition event NAVIGATE. Source: controller-or-native-contract.
- `{ type: "SELECT"; key: string; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Command semantic transition event SELECT. Source: controller-or-native-contract.
- `{ type: "CLEAR"; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — Command semantic transition event CLEAR. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — Command semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onValueChange(value: UIFnSelectionValue) => void` — Called after Command requests a value change. Controlled consumers must commit the value back through value.
- `onInputValueChange(value: string) => void` — Called after Command requests a inputValue change. Controlled consumers must commit the value back through inputValue.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `value` | `UIFnSelectionValue` | no | yes | `undefined (uncontrolled)` | Optional reactive value input from the canonical Command contract. |
| `defaultValue` | `UIFnSelectionValue` | no | yes | `undefined (component initial value)` | Optional reactive defaultValue input from the canonical Command contract. |
| `inputValue` | `string` | no | yes | `undefined (uncontrolled)` | Optional reactive inputValue input from the canonical Command contract. |
| `defaultInputValue` | `string` | no | yes | `undefined → ""` | Optional reactive defaultInputValue input from the canonical Command contract. |
| `items` | `readonly (CommandItem | string)[]` | no | yes | `undefined (no public prop override)` | Optional reactive items input from the canonical Command contract. |
| `multiple` | `boolean` | no | yes | `undefined → false` | Optional reactive multiple input from the canonical Command contract. |
| `loop` | `boolean` | no | yes | `undefined → false` | Optional reactive loop input from the canonical Command contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical Command contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical Command contract. |
| `readOnly` | `boolean` | no | yes | `undefined → false` | Optional reactive readOnly input from the canonical Command contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical Command contract. |
| `placeholder` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive placeholder input from the canonical Command contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `compound`. Controlled inputs: `value`, `inputValue`. Uncontrolled defaults: `defaultValue`, `defaultInputValue`. Change events: `VALUE_CHANGE`, `INPUT_VALUE_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `selection-collection`. Native semantic basis: Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-listbox, wai-aria-apg-combobox, wai-aria-apg-radio. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `selection-specific`; keys: `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, `Escape`, `typeahead`. Pointer/touch obligations: select-item, toggle-item, touch-scroll-arbitration. Focus obligations: active-item, selected-item, dynamic-collection-focus-repair.

## Forms

<a id="forms"></a>

Participation: `controller-bridge`; value shape: `multiple`; reset: `controller-and-native-form`; validation: `native-proxy-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `Command` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="command"` on all styled parts; stable.
- `data-uifn-part="root | label | input | list | empty | loading | group | groupHeading | item | itemIndicator | separator | shortcut | hiddenInput"` on all styled parts; stable.
- `data-state="idle | composing | loading | empty | selected"` on stateful parts; stable semantic state.
- `data-disabled="true | false"` on parts whose semantics depend on this input; stable semantic state.
- `data-readonly="true | false"` on parts whose semantics depend on this input; stable semantic state.

CSS variables:

- `--uifn-command-item-block-size` (component)
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
| react | `@uifn/components-react/command` | `components/uifn/react/command.ts` |
| svelte | `@uifn/components-svelte/command` | `components/uifn/svelte/command/CommandEmpty.svelte` |
| solid | `@uifn/components-solid/command` | `components/uifn/solid/command.ts` |

#### React · package

```tsx
import * as React from 'react';
import { CommandRoot } from "@uifn/components-react/command";

export function CommandExample() {
  return React.createElement(CommandRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### React · source

```tsx
import * as React from 'react';
import { CommandRoot } from "./components/uifn/react/command.js";

export function CommandExample() {
  return React.createElement(CommandRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { CommandRoot } from "@uifn/components-svelte/command";
</script>

<CommandRoot items={[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]} />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { CommandRoot } from "./components/uifn/svelte/command/index.js";
</script>

<CommandRoot items={[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]} />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { CommandRoot } from "@uifn/components-solid/command";

export function CommandExample() {
  return createComponent(CommandRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { CommandRoot } from "./components/uifn/solid/command.js";

export function CommandExample() {
  return createComponent(CommandRoot, {"items":[{"id":"item-1","value":"item-1","label":"First option","textValue":"First option"},{"id":"item-2","value":"item-2","label":"Second option","textValue":"Second option"},{"id":"item-3","value":"item-3","label":"Unavailable option","textValue":"Unavailable option","disabled":true}]});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add command --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- The built-in matcher uses item text values; remote search, ranking, and command execution remain application-owned.
- The embedded Command surface is non-modal. Compose it inside Dialog when modal command-palette behavior is required.
- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- The input owns combobox semantics and points to the command list with aria-controls.
- Keyboard navigation skips disabled items and preserves composition input.
