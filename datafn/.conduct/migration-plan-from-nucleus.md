# Migration plan: Nucleus (`flux.ts` / ResourceStore) → `datafn`

## Goal
Migrate Nucleus from the current Flux + Store layer to `datafn` with minimal regressions, preserving:
- offline-first behavior (Dexie/IndexedDB + sync)
- extension delegation behavior
- optimistic UI + existing subscriptions/events

This plan assumes `datafn` core capabilities (init/query/mutate/subscribe/transact + seed/clone/pull/push).

## Current Nucleus surfaces (to map)
- `nucleus/client/components/flux/flux.ts`: init, local/remote select/selectMany, mutation log, syncDown/syncUp/cloneDown, extension relays
- `nucleus/client/components/flux/resourceStores/resource.store.ts`: `ResourceStore`/`ActiveResourceStore` and app-facing CRUD helpers
- Global mutation events + ad-hoc subscriptions (e.g. `GlobalEvent.MUTATION`)

## Strategy (phased, low-risk)

### Phase 0 — Introduce `datafn` as a thin wrapper (no behavior change)
- Implement a `datafn` persistence adapter that delegates to the existing persistence engine used by `flux.ts`.
- Implement `datafn` remote adapter that delegates to current relay endpoints (until `/datafn/*` exists).
- Do not change app stores yet; only prove parity in a small sandbox module.

Deliverable:
- `datafn.init(...)` can be called in Nucleus and performs no-op parity queries/mutations.

### Phase 1 — Compatibility shim for Flux API
Goal: allow Nucleus code to keep calling Flux-like methods while `datafn` becomes the engine.

- Create a `flux.compat.ts` (or similar) that exposes:
  - `select`, `selectMany` → `datafn.<table>.query(...)`
  - `mutation` → `datafn.<table>.mutate(...)`
  - `syncDown/syncUp/cloneDown` → `datafn.sync.pull/push/clone`
- Keep return shapes compatible enough for existing call sites.

Deliverable:
- Nucleus can swap imports from `flux.ts` to `flux.compat.ts` in one place (bootstrap/init), while the rest stays unchanged.

### Phase 2 — Move `ResourceStore` and `ActiveResourceStore` to `datafn`
- Replace internal calls to `flux.select/selectMany/mutation` with `datafn` equivalents.
- Replace global event subscriptions with `datafn.subscribe` under the hood.
- Keep the public methods stable (`create/modify/delete/link/unlink` etc), only change implementation.

Deliverable:
- Existing Svelte stores continue to work but the backing engine is now `datafn`.

### Phase 3 — Replace app-level subscription patterns
- Remove/phase out `GlobalEvent.MUTATION` dependency where possible.
- Update components to subscribe to:
  - per-query signal-backed values (declarative)
  - per-table event subscriptions (imperative)
- Introduce per-record subscriptions to reduce over-fetching and re-rendering.

Deliverable:
- The app uses `datafn` subscriptions directly in key areas (e.g. record views / lists).

### Phase 4 — Extension-first surfaces
- Centralize extension delegation inside `datafn`:
  - background page owns persistence + sync
  - content/sidepanel are thin clients
  - subscriptions propagate via extension messaging / BroadcastChannel
- Remove branching logic from old flux extension mediators once parity is proven.

Deliverable:
- Identical data API from web app and extension contexts.

### Phase 5 — Remove legacy Flux implementation
- Delete or freeze `flux.ts` (keep only a small adapter if needed).
- Replace remaining usage with `datafn`.

Deliverable:
- Single data runtime across products.

## Mapping: old → new (conceptual)
- `flux.select(id)` → `datafn.<table>.query({ filters: { id }, select: [...] })`
- `flux.selectMany(resource, params)` → `datafn.<resource>.query(params)`
- `flux.mutation(resource, params)` → `datafn.<resource>.mutate(mutation)`
- `dispatchCustomEvent(GlobalEvent.MUTATION, ...)` → `datafn.subscribe(...)`
- `flux.syncDown()` → `datafn.sync.pull()`
- `flux.sync()` → `datafn.sync.push()`
- `flux.cloneDown()` → `datafn.sync.clone()`

## Validation checklist (each phase)
- Local-first correctness:
  - queries match before/after for the same dataset
  - optimistic updates still show immediately
- Sync correctness:
  - offline mutation log persists
  - push is idempotent (`mutationId` + `clientId`)
  - pull applies changes deterministically
- Extension correctness:
  - content/sidepanel reads/writes work
  - subscriptions update all surfaces

