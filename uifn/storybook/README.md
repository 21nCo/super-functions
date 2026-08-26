# @uifn/storybook

The release-blocking Storybook preset, compatibility panel, and public-package workbenches for uifn.

Status: `ga-candidate`. Storybook is optional at application runtime and mandatory for stable-lane release validation.

## What is proven

The delivery generator derives the story inventory from the canonical 69-primitive catalog. React, Svelte, and Solid each build a real Storybook with their native renderer and import every primitive from the corresponding public styled-package subpath.

The canonical matrix contains 2,115 stories: 705 for each framework. It covers every declared primitive scenario plus an explicit anatomy story, including controlled/uncontrolled behavior where supported, semantic variants, disabled/read-only/invalid states, keyboard/focus operation, RTL, forced colors, reduced motion, responsive layouts, and edge cases.

The browser gate visits and operates every built story. Console, page, network, serious/critical axe, missing-export, and static-test-double failures block release validation. Each passing result carries semantic DOM and screenshot hashes.

## Preset

```ts
// .storybook/main.ts
export default {
  addons: ['@uifn/storybook', '@storybook/addon-docs', '@storybook/addon-a11y'],
}
```

The preset installs global theme, direction, forced-colors, and reduced-motion controls plus a registry-backed compatibility panel. Metadata-only stories are not accepted.

## Maintainer commands

```bash
npm run generate:check
npm run typecheck
npm test
npm run build
npm run build:workbenches
```

Run `npm --workspace @uifn/storybook run typecheck`, `test`, and `build` for the complete package gate. Its result remains provisional until the separately signed external compatibility gate is complete.
