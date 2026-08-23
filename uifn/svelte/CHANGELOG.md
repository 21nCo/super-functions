# Changelog

## Unreleased - 2026-07-18

- Replaced the partial handwritten adapter with generated Svelte 5 compounds for all 69 stable primitives and 465 anatomy parts.
- Routed reactive inputs through `controller.update` without recreating controllers or DOM ownership resources.
- Added typed snippets, render actions, bindable controlled values, element refs, portal targets, and native form participation.
- Switched publishing to standard Svelte packaging with compiled `dist` JavaScript, declarations, Svelte metadata, and direct primitive subpaths.
- Added clean packed-consumer SSR/hydration and production-build verification in Chromium, Firefox, and WebKit.
- Removed raw repository TypeScript entrypoints and legacy public machine factories.

## 0.0.1 - 2026-03-20

- Marked `@uifn/svelte` as GA in the initial release contract.
- Aligned Svelte peer range with the documented support matrix.
- Added package release-hygiene metadata and npm ignore rules for tests.
- Documented deterministic Avatar fallback and adapter-only `VirtualizedList` overscan/render contract.
