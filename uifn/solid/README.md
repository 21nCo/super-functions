# @uifn/solid

Native, permanently headless Solid compounds for all 69 stable uifn primitives and their 465 catalog-defined anatomy parts. Controllers come from `@uifn/core`; portals, focus, layers, positioning, presence, and form integration come from `@uifn/dom`. The adapter owns Solid composition and reactivity only.

This package never ships visual CSS, tokens, themes, or component styling. Use
it to build a design system; use `@uifn/components-solid` plus
`@uifn/components/styles.css` for the maintained styled compounds.

Status: `ga-candidate`. Requires Solid `>=1.9.0 <2`.

## Install and use

```bash
npm install @uifn/solid solid-js
```

```tsx
import { createSignal } from 'solid-js';
import { Accordion } from '@uifn/solid/accordion';

export function Settings() {
  const [value, setValue] = createSignal<string[]>([]);

  return (
    <Accordion.Root
      type="multiple"
      items={['account']}
      value={value()}
      onValueChange={(next) => setValue(next as string[])}
    >
      <Accordion.Item value="account">
        <Accordion.Header value="account">
          <Accordion.Trigger value="account">Account</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content value="account">Account settings</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
```

Every primitive supports a root import such as `@uifn/solid/accordion`; `@uifn/solid` exports the complete catalog. Prefer direct subpaths when bundle size is critical.

## Composition

Root and part components accept native intrinsic props, `as`, `ref`, children, and a `render` callback. The callback receives reactive accessors for projected props, state, actions, lifecycle counters, and the internal bridge:

```tsx
<Dialog.Root render={(api) => (
  <section {...api.props()} data-open={api.state().open}>
    <Dialog.Trigger>Open</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Content>
        <Dialog.Title>Profile</Dialog.Title>
        <Dialog.Description>Edit your profile.</Dialog.Description>
      </Dialog.Content>
    </Dialog.Portal>
  </section>
)} />
```

Read `api.props()`, `api.state()`, and `api.actions()` inside a reactive scope. Do not destructure their current values and expect them to remain live.

## SSR and hydration

The published package contains standard Solid JSX and must be compiled with the Solid plugin. For an SSR application, enable the plugin's paired hydratable transforms in both the browser and server Vite environments:

```ts
import solid from 'vite-plugin-solid';

export default {
  plugins: [solid({ ssr: true })],
};
```

Use the normal Solid `renderToString`/`hydrate` or SolidStart pipeline. uifn assigns primitive IDs from a render-owner-local sequence, so concurrent server renders and browser hydration reproduce controller IDs without sharing mutable request state. Explicit `environment.scopeId` and `environment.hydrationSeed` remain available for application-controlled identity.

Portals render in place on the server and move through the shared DOM platform after hydration. Native hidden inputs participate in `FormData` and form reset. Disposing the Solid owner synchronously destroys controllers, listeners, portal ownership, and DOM services.

## Generation and verification

The compound source is generated from `uifn/catalog/generated/catalog.json`; do not hand-edit `src/generated`.

```bash
npm --workspace @uifn/solid run generate:check
npm --workspace @uifn/solid run typecheck
npm --workspace @uifn/solid run test
npm --workspace @uifn/solid run test
```

The phase verifier checks exact catalog/export inventory, stale-reactivity mutations, SSR determinism, packaged and source consumers, Chromium/Firefox/WebKit behavior, tree shaking, forms, portals, dynamic collections, abrupt disposal, and tarball contents.

## Workbench

```bash
npm --workspace @uifn/examples run dev:solid
npm run verify:uifn-browser -- --framework solid
```
