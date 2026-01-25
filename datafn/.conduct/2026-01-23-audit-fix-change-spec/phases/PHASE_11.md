## Phase 11

### Phase goal (1 sentence)

Make offline mutation behavior correct and deterministic: offline fallback only on transport unavailability, deterministic changelog append, and deterministic optimistic local writes.

### In scope

- Define and implement “transport error classification” for `@datafn/client` mutations.
- Restrict offline fallback to transport errors only.
- Implement deterministic optimistic local writes for supported operations:
  - insert / merge / replace / delete
  - (and relation ops if supported by storage + schema)
- Ensure changelog append is performed before optimistic apply and is deduped by storage adapter.

### Out of scope

- Server mutation relation ops (server-side; if required separately, add a dedicated phase).
- Sync push/pull behavior changes (server already supports).

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/mutate.ts`
- Modify: `datafn/client/src/offline/mutate.ts`
- Modify tests:
  - `datafn/client/__tests__/offline-mutate.test.ts`
  - `datafn/client/__tests__/mutate.test.ts` (transport error path)

### Requirements covered

- CLIENT-OFFLINE-MUT-001

### Implementation tasks (ordered checklist)

- Define transport error detection:
  - `TRANSPORT_ERROR` thrown by unwrap/transport layer
  - fetch/network errors (if applicable)
- Ensure remote rejection (ok:false envelope) does **not** trigger offline fallback.
- Ensure thrown errors trigger:
  - `mutation_rejected` event emission (from Phase 07)
  - offline fallback only if classified as transport error and storage configured
- Implement optimistic apply rules (deterministic):
  - insert: upsert record(s)
  - merge: merge fields into existing record, preserving unspecified fields
  - replace: replace record fields (keep id)
  - delete: delete record(s) and optionally cascade/unrelate per mutation semantics
- Update tests:
  - offline fallback success path (`TV-OFFLINE-MUT-001`)
  - changelog append failure surfaces deterministically (`TV-OFFLINE-MUT-002`)

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Offline mutation vectors validated:
  - `TV-OFFLINE-MUT-001`
  - `TV-OFFLINE-MUT-002`

### Stop condition

Report:

- The exact transport error classification logic
- The ordering guarantees (append-before-apply)
- Test run result for `@datafn/client`

