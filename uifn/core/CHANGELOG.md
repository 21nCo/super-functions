# Changelog

## Unreleased

- Added the uniform public controller, typed part-composition, and explicit environment/scope contracts.
- Added reactive controlled-input synchronization, immutable snapshots, selector subscriptions, and synchronous idempotent teardown across all 25 current controller factories.
- Removed the public generic state-machine entrypoint, wildcard primitive implementation subpaths, legacy `createX` constructors, adapter wrappers, local store API, and process-global ID helpers without compatibility shims.
- Added a versioned removal manifest and breaking migration guide.

## 0.0.1 - 2026-03-20

- Declared `@uifn/core` as the canonical core package identity.
- Aligned the then-current export-path contract for `aria`, `state`, `utils`, and `primitives` (superseded by the Unreleased breaking cutover).
- Added release-hygiene metadata (`CHANGELOG.md` in packed files, Node engine range).
- Documented adapter-only ownership for display-helper surfaces (`Avatar`, `Badge`, `Label`, `Separator`, `VirtualizedList`).
