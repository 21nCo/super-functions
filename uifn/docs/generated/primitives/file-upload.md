# FileUpload

Canonical primitive: `file-upload`.

## Overview

<a id="overview"></a>

FileUpload is the stable styled forms-input primitive. Behavior is owned by `@uifn/core`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: `interactive-controller`.

## Anatomy

<a id="anatomy"></a>

| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |
|---|---|---|---|---|---|---|---|
| `root` | `FileUploadRoot` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `label` | `FileUploadLabel` | `label` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `dropzone` | `FileUploadDropzone` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `trigger` | `FileUploadTrigger` | `button` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `input` | `FileUploadInput` | `input` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemGroup` | `FileUploadItemGroup` | `ul` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `item` | `FileUploadItem` | `li` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemName` | `FileUploadItemName` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemSize` | `FileUploadItemSize` | `span` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `itemDelete` | `FileUploadItemDelete` | `button` | many | `string` | `value: string`, `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `value: string`, `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `value: string`, `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `error` | `FileUploadError` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |
| `status` | `FileUploadStatus` | `div` | one | — | `native element props`, `className?: string`, `children?: ReactNode`, `asChild?: boolean`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` | `native element props`, `class?: string`, `children snippet`, `render snippet`, `forceMount?: boolean`, `container?: HTMLElement | null`, `bind:ref` | `native element props`, `class?: string`, `children?: JSX.Element`, `render?`, `forceMount?: boolean`, `container?: HTMLElement | null`, `ref` |

## State, actions, and parts

<a id="state-actions-parts"></a>

Controller and context ownership:

- Core: `@uifn/core/file-upload: createFileUploadController(props, environment?)`
- State: `FileUploadState`
- Actions: `FileUploadActions`
- Parts: `FileUploadController["parts"]`
- DOM owner: @uifn/dom owns root-scope-modality-tabbability, form-bridges-live-regions
- react context: `FileUploadProvider and useFileUpload(inputs); adapter context remains private`
- svelte context: `FileUploadProvider; adapter context remains private to compound descendants`
- solid context: `FileUploadProvider; adapter context remains private to compound descendants`

States:

- `idle` (semantic)
- `drag-active` (semantic)
- `validating` (semantic)
- `accepted` (semantic)
- `rejected` (semantic)

Complete transition signatures:

- `{ type: "PICK" }` — FileUpload semantic transition event PICK. Source: controller-or-native-contract.
- `{ type: "DROP" }` — FileUpload semantic transition event DROP. Source: controller-or-native-contract.
- `{ type: "VALIDATE" }` — FileUpload semantic transition event VALIDATE. Source: controller-or-native-contract.
- `{ type: "ADD_FILES" }` — FileUpload semantic transition event ADD_FILES. Source: controller-or-native-contract.
- `{ type: "REMOVE_FILE" }` — FileUpload semantic transition event REMOVE_FILE. Source: controller-or-native-contract.
- `{ type: "CLEAR"; inputModality?: "keyboard" | "pointer" | "touch" | "virtual" }` — FileUpload semantic transition event CLEAR. Source: controller-or-native-contract.
- `{ type: "FORM_RESET"; form?: string }` — FileUpload semantic transition event FORM_RESET. Source: controller-or-native-contract.

Controlled callbacks:

- `onFilesChange(value: file[]) => void` — Called after FileUpload requests a files change. Controlled consumers must commit the value back through files.

Root inputs and defaults:

| Input | Type | Required | Reactive | Default | Description |
|---|---|---:|---:|---|---|
| `files` | `file[]` | no | yes | `undefined (no public prop override)` | Optional reactive files input from the canonical FileUpload contract. |
| `defaultFiles` | `file[]` | no | yes | `undefined → []` | Optional reactive defaultFiles input from the canonical FileUpload contract. |
| `accept` | `string[]` | no | yes | `undefined (no public prop override)` | Optional reactive accept input from the canonical FileUpload contract. |
| `multiple` | `boolean` | no | yes | `undefined → false` | Optional reactive multiple input from the canonical FileUpload contract. |
| `maxFiles` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive maxFiles input from the canonical FileUpload contract. |
| `maxSize` | `number` | no | yes | `undefined (no public prop override)` | Optional reactive maxSize input from the canonical FileUpload contract. |
| `name` | `string` | no | yes | `undefined (no public prop override)` | Optional reactive name input from the canonical FileUpload contract. |
| `disabled` | `boolean` | no | yes | `undefined → false` | Optional reactive disabled input from the canonical FileUpload contract. |
| `required` | `boolean` | no | yes | `undefined → false` | Optional reactive required input from the canonical FileUpload contract. |

## Controlled and uncontrolled

<a id="controlled-uncontrolled"></a>

Control mode: `multiple`. Controlled inputs: `files`. Uncontrolled defaults: `defaultFiles`. Change events: `FILES_CHANGE`. Do not switch mode after mount.

## Accessibility

<a id="accessibility"></a>

Profile: `forms-input`. Native semantic basis: Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.

Accessible name required: yes; accepted sources: label-element, aria-label, aria-labelledby. WCAG mapping: 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.3.1, 3.3.2, 3.3.3, 4.1.2, 4.1.3. Normative basis: native-html, wai-aria-apg-spinbutton. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.

## Keyboard, pointer, and touch

<a id="keyboard-pointer-touch"></a>

Keyboard model: `native-input-plus-declared-enhancements`; keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `composition`. Pointer/touch obligations: native-control-interaction, target-size, file-picker-where-applicable. Focus obligations: visible-input-focus, error-focus-policy, caret-and-selection-preservation.

## Forms

<a id="forms"></a>

Participation: `native-file-input`; value shape: `file-list-never-serialized`; reset: `native-and-controller`; validation: `native-and-controller`.

## Direction and locale

<a id="direction-locale"></a>

RTL contract: Declare logical versus physical direction behavior and mirror only directional semantics. Direction is supplied through DOM `dir`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.

## SSR and hydration

<a id="ssr-hydration"></a>

The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (root-scope-modality-tabbability, form-bridges-live-regions) activate only after the DOM is available.

## Composition and styling

<a id="composition-styling"></a>

Use the compound root `FileUpload` or named parts shown above. Import `@uifn/components/styles.css` once, then override tokens or low-specificity part selectors in a later CSS layer.

Stable data attributes:

- `data-uifn-component="file-upload"` on all styled parts; stable.
- `data-uifn-part="root | label | dropzone | trigger | input | itemGroup | item | itemName | itemSize | itemDelete | error | status"` on all styled parts; stable.
- `data-state="idle | drag-active | validating | accepted | rejected"` on stateful parts; stable semantic state.
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
| react | `@uifn/components-react/file-upload` | `components/uifn/react/file-upload.ts` |
| svelte | `@uifn/components-svelte/file-upload` | `components/uifn/svelte/file-upload/FileUploadDropzone.svelte` |
| solid | `@uifn/components-solid/file-upload` | `components/uifn/solid/file-upload.ts` |

#### React · package

```tsx
import * as React from 'react';
import { FileUploadRoot } from "@uifn/components-react/file-upload";

export function FileUploadExample() {
  return React.createElement(FileUploadRoot, {});
}
```

#### React · source

```tsx
import * as React from 'react';
import { FileUploadRoot } from "./components/uifn/react/file-upload.js";

export function FileUploadExample() {
  return React.createElement(FileUploadRoot, {});
}
```

#### Svelte · package

```svelte
<script lang="ts">
  import { FileUploadRoot } from "@uifn/components-svelte/file-upload";
</script>

<FileUploadRoot  />
```

#### Svelte · source

```svelte
<script lang="ts">
  import { FileUploadRoot } from "./components/uifn/svelte/file-upload/index.js";
</script>

<FileUploadRoot  />
```

#### Solid · package

```tsx
import { createComponent } from 'solid-js';
import { FileUploadRoot } from "@uifn/components-solid/file-upload";

export function FileUploadExample() {
  return createComponent(FileUploadRoot, {});
}
```

#### Solid · source

```tsx
import { createComponent } from 'solid-js';
import { FileUploadRoot } from "./components/uifn/solid/file-upload.js";

export function FileUploadExample() {
  return createComponent(FileUploadRoot, {});
}
```

## Source install

<a id="source-install"></a>

Use `uifn add file-upload --framework <react|svelte|solid>` through `@uifn/registry`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let `uifn diff` report local divergence.

## Known constraints

<a id="known-constraints"></a>

Required release channel: `stable-1.0`. Catalog status: `ga-required`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: none.

Explicit limitations:

- Controller state and actions are framework-neutral; focus, layers, portals, positioning, presence, and native form bridges activate through @uifn/dom after mount.
- File names may be announced to the user but file contents never enter traces or serialization.
