## Phase goal

Implement durable, monotonic sync semantics on the server: `serverSeq` ordering, change tracking, and correct `/datafn/clone|pull|push` behavior (including deterministic conflict defaults).

---

## In scope

- Persist a monotonic `serverSeq` per namespace and use it as the ordering source of truth (SERVER-CONFLICT-001).
- Implement adapter-backed change tracking and cursors for clone/pull/push (SERVER-SYNC-001..003).
- Ensure clone/pull/push payloads require `clientId` and validate cursors deterministically.

## Out of scope

- Server plugin execution and search gating (Phase 10).
- DFQL completeness features unrelated to sync payloads (Phase 11+).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/routes/sync.ts`
- `superfunctions/datafn/server/src/execution/sync/clone.ts`
- `superfunctions/datafn/server/src/execution/sync/pull.ts`
- `superfunctions/datafn/server/src/execution/sync/push.ts`

Add:
- `superfunctions/datafn/server/src/execution/sync/change-tracking.ts`
- `superfunctions/datafn/server/__tests__/sync-ordering.test.ts`

---

## Requirements covered

- SERVER-CONFLICT-001
- SERVER-SYNC-001
- SERVER-SYNC-002
- SERVER-SYNC-003

---

## Implementation tasks

- [ ] Implement internal tables described in `SPEC.md`:
  - [ ] `__datafn_meta` for `nextServerSeq`
  - [ ] `__datafn_changes` for change tracking
- [ ] Assign `serverSeq`:
  - [ ] Increment once per applied mutation (including push mutations).
  - [ ] Write one change entry per affected `(resource,id)` with `op:"upsert"|"delete"`.
- [ ] Implement `/datafn/clone`:
  - [ ] Require `clientId` and reject remote-only tables.
  - [ ] Return full snapshot `data` and `cursors` derived from latest `serverSeq` per table.
- [ ] Implement `/datafn/pull`:
  - [ ] Require `clientId` and validate cursor strings.
  - [ ] Return `records` and `deleted` since cursor using change tracking.
  - [ ] Advance cursors monotonically.
- [ ] Implement `/datafn/push`:
  - [ ] Require `clientId`.
  - [ ] Apply each mutation idempotently and write change tracking.
  - [ ] Return `applied[]` and `errors[]` per spec.
- [ ] Add tests implementing:
  - [ ] `TV-CONFLICT-001`, `TV-CONFLICT-002`
  - [ ] `TV-SERVER-CLONE-001`, `TV-SERVER-CLONE-002`
  - [ ] `TV-SERVER-PULL-001`, `TV-SERVER-PULL-002`
  - [ ] `TV-SERVER-PUSH-001`, `TV-SERVER-PUSH-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Sync + conflict vectors pass exactly and cursors are monotonic.

---

## Stop condition

Report:
- Server assigns monotonic `serverSeq`.
- Clone/pull/push are adapter-backed and deterministic, with correct cursor behavior and deleted tracking.

