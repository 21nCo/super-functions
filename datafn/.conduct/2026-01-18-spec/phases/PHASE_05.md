## Phase goal

Implement minimal `@datafn/client` event emission + subscription filtering and `@datafn/svelte` adapter so `TV-EVENTS-*` vectors pass.

---

## In scope

- New package `superfunctions/datafn/client` (`@datafn/client`):
  - `createDatafnClient`
  - in-process event bus
  - `subscribe(handler, filter)` with deterministic matching
  - `mutate(...)` that emits `mutation_applied` or `mutation_rejected` based on outcome (using an injected executor or remote adapter)
- New package `superfunctions/datafn/svelte` (`@datafn/svelte`):
  - `toSvelteStore(signal)`

## Out of scope

- IndexedDB storage adapter.
- Local-first query caching and invalidation.
- Extension messaging/RPC transport.
- Sync client workflows (`clone/pull/push`) (server-only in MVP).

---

## Deliverables

- `superfunctions/datafn/client/package.json`
- `superfunctions/datafn/client/tsconfig.json`
- `superfunctions/datafn/client/tsup.config.ts`
- `superfunctions/datafn/client/vitest.config.ts`
- `superfunctions/datafn/client/src/index.ts`
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/events/bus.ts`
- `superfunctions/datafn/client/src/events/filter.ts`
- `superfunctions/datafn/client/__tests__/events.test.ts` (assert `TV-EVENTS-001`, `TV-EVENTS-002`)
- `superfunctions/datafn/svelte/package.json`
- `superfunctions/datafn/svelte/tsconfig.json`
- `superfunctions/datafn/svelte/tsup.config.ts`
- `superfunctions/datafn/svelte/vitest.config.ts`
- `superfunctions/datafn/svelte/src/index.ts`
- `superfunctions/datafn/svelte/src/toSvelteStore.ts`
- `superfunctions/datafn/svelte/__tests__/toSvelteStore.test.ts`

---

## Requirements covered

- EVENTS-001

---

## Implementation tasks

- [ ] Create `@datafn/client` package scaffold.
- [ ] Implement event bus:
  - [ ] `emit(event)`
  - [ ] `subscribe(handler, filter)` returns unsubscribe
  - [ ] Deterministic filter matching on `type`, `resource`, `ids`, `mutationId` (exact match; arrays mean “any of”).
- [ ] Implement `createDatafnClient(config)`:
  - [ ] Accept `schema`, `storage` (unused in this phase), and an injected `executor` or `remote` adapter for mutations.
  - [ ] Implement `mutate(mutation)` that:
    - [ ] calls the injected mutation executor (stubbed in tests)
    - [ ] emits `mutation_applied` on success with deterministic `timestampMs` (tests use fake clock injection)
    - [ ] emits `mutation_rejected` on failure
- [ ] Create `@datafn/svelte` package scaffold.
- [ ] Implement `toSvelteStore(signal)`:
  - [ ] Create a Svelte `Readable` that subscribes/unsubscribes from `signal.subscribe`.
  - [ ] Ensure initial value equals `signal.get()`.
- [ ] Tests:
  - [ ] `events.test.ts` asserts `TV-EVENTS-001` and `TV-EVENTS-002` exactly (use fake clock).
  - [ ] `toSvelteStore.test.ts` asserts store values update when signal emits.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
npx turbo run test --filter=@datafn/svelte
```

Expected outcome:
- Client and svelte adapter tests pass.

---

## Stop condition

Report:
- Confirmation that event filtering is deterministic and matches `TEST_VECTORS.md`.
- Any constraints discovered for introducing real storage/sync later (must be documented as future work, not implemented in this phase).

