## Phase goal

Implement `DatafnTable.signal` reactive query signals, add the client `sync` facade, and update `@datafn/svelte` README to show real end-to-end usage.

---

## In scope

- Query signal caching by `dfqlKey(fullQuery)` and object identity reuse.
- Lazy initial fetch on first subscribe.
- Refresh on `mutation_applied` for same resource with deterministic in-flight de-duplication.
- Refresh failure behavior (no value change, no subscriber notification).
- `client.sync.clone/pull/push` remote delegation + unwrapping + transport error on missing methods.
- Update `superfunctions/datafn/svelte/README.md` Quick Start to use `client.task.signal(...)` + `toSvelteStore`.

## Out of scope

- Tracking dependency graph between expanded relations and other resources (e.g. auto-refresh on related resource mutations).
- Local persistence and hydration state machines.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/tables/table.ts`
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/svelte/README.md`

Add:
- `superfunctions/datafn/client/src/signals/querySignal.ts`
- `superfunctions/datafn/client/src/sync.ts`
- `superfunctions/datafn/client/__tests__/signals.test.ts`
- `superfunctions/datafn/client/__tests__/sync.test.ts`

---

## Requirements covered

- CLIENT-SIGNAL-001
- CLIENT-SYNC-001
- DOC-001

---

## Implementation tasks

- [ ] Implement query signal in `src/signals/querySignal.ts`:
  - [ ] Keying: `dfqlKey(fullQuery)`; reuse same signal object for same key.
  - [ ] Lazy fetch: first subscribe triggers fetch; deliver fetched value to subscribers.
  - [ ] Refresh trigger: listen to client event bus; on `mutation_applied` for same resource, schedule refresh.
  - [ ] De-dup: at most one in-flight fetch; at most one queued refresh after in-flight completes.
  - [ ] Refresh failure: swallow error, keep last value, do not notify.
- [ ] Wire `DatafnTable.signal(fragment)`:
  - [ ] Merge full query (resource/version + fragment)
  - [ ] Return cached signal.
- [ ] Implement sync facade `src/sync.ts`:
  - [ ] `clone/pull/push` delegate to remote methods.
  - [ ] Unwrap wrapped results.
  - [ ] Missing remote method → throw `TRANSPORT_ERROR` with message `Transport error: remote method missing: <name>`.
- [ ] Wire `client.sync` to the sync facade.
- [ ] Update `@datafn/svelte` README:
  - [ ] Replace hand-rolled signal quick start with:
    - create client
    - create query signal via `client.task.signal({ select: [...] })`
    - convert via `toSvelteStore`
  - [ ] Ensure README contains the strings asserted by `TV-DOC-001`.
- [ ] Add tests:
  - [ ] `signals.test.ts` asserts `TV-SIGNAL-001` and `TV-SIGNAL-002`.
  - [ ] `sync.test.ts` asserts `TV-SYNC-001` and `TV-SYNC-002`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-SIGNAL-*` and `TV-SYNC-*` assertions pass exactly.

- Manual doc check:
  - Open `superfunctions/datafn/svelte/README.md`
  - Confirm Quick Start uses `client.task.signal(...)` (no hand-rolled `DatafnSignal`)

---

## Stop condition

Report:
- Confirmation that query signals refresh deterministically on `mutation_applied`.
- Confirmation that README matches the desired developer experience.

