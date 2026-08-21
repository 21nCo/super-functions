# @uifn/svelte

Catalog-complete, permanently headless Svelte 5 compounds for uifn. The package exposes all 69 stable primitives and all 465 catalog anatomy parts as concrete typed Svelte components.

This package never ships visual CSS, tokens, themes, or component styling. Use
it to build a design system; use `@uifn/components-svelte` plus
`@uifn/components/styles.css` for the maintained styled compounds.

The components are adapters over `@uifn/core` controllers and static contracts. Browser behavior—focus, layers, portals, positioning, gestures, native form reset, and presence—remains owned by `@uifn/dom`. Components do not contain a second framework-local state machine.

## Install

```bash
npm install @uifn/svelte @uifn/core @uifn/dom @uifn/adapter-kit svelte
```

Svelte `>=5.20 <6` and Node `20` through `24` are supported.

## Compound API

Import the complete package or a tree-shakeable primitive subpath:

```svelte
<script lang="ts">
  import { Accordion } from '@uifn/svelte/accordion';

  let value = $state<string | string[]>([]);
</script>

<Accordion.Root type="multiple" bind:value>
  <Accordion.Item value="billing">
    <Accordion.Header value="billing">
      <Accordion.Trigger value="billing">Billing</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content value="billing">Billing details</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
```

Every catalog part is also a named export, such as `AccordionRoot` and `AccordionTrigger`. Parts whose anatomy cardinality is `many` require a typed `value` that identifies the corresponding core part.

## Svelte 5 contracts

- Root inputs are reactive and update the existing controller through `controller.update`; prop changes do not recreate the behavior service.
- Controlled values are bindable where the catalog defines them: `bind:value`, `bind:open`, `bind:checked`, and the corresponding primitive-specific bindings.
- Every component supports `bind:ref`, a `children` snippet, and a typed `render` snippet.
- A render snippet receives merged props, the Svelte action and its parameters, the current state/actions/status, and the bridge. Apply the supplied action when replacing the default element.
- User event callbacks run before internal behavior. `event.preventDefault()` cancels cancelable internal behavior while protected accessibility invariants remain intact.
- Components use `$props.id()` plus the injected environment to keep IDs stable across SSR and hydration.

## SSR and packaging

The npm package exports only `dist` entries. JavaScript helpers and declarations are compiled, component sources are preprocessed by the standard Svelte library packager, and no repository TypeScript path is an npm entrypoint.

SSR renders deterministic semantic HTML. Hydration activates the live controller and DOM services once, preserves server IDs, and synchronously tears down controller subscriptions, actions, portals, and DOM leases on unmount.

## Forms and portals

Render the catalog's `HiddenInput` parts for form primitives. Checkbox and radio families use native checked controls; other value families serialize through hidden inputs. Form reset is delegated to the shared DOM platform.

Portal parts render in place during SSR and move through `@uifn/dom` after mount. Pass `container` to target an element, shadow root, selector, or target function.

## Workbench

The Svelte Workbench app is `@uifn/example-svelte-workbench` under `uifn/examples/svelte-workbench`.

```bash
npm --workspace @uifn/examples run dev:svelte
npm run verify:uifn-browser -- --framework svelte
```

## Verification

```bash
npm --workspace @uifn/svelte run typecheck
```

The phase gate covers the full catalog inventory, Svelte diagnostics, source and packed production builds, SSR/hydration equivalence, Chromium/Firefox/WebKit behavior, lifecycle counters, forms, portals, exact negative mutation codes, and clean npm tarballs.
