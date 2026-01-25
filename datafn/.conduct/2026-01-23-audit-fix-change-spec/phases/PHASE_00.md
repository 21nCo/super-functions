## Phase 00

### Phase goal (1 sentence)

Establish the shared deterministic primitives in `@datafn/core` (canonical envelopes + `unwrapEnvelope` + extended event/filter types) required by all downstream fixes.

### In scope

- Add `unwrapEnvelope` (or equivalent) to `@datafn/core` and export it.
- Extend `DatafnEvent` and `DatafnEventFilter` in `@datafn/core` with `action`, `fields`, and `contextKeys`.
- Add/adjust unit tests in `@datafn/core` to lock deterministic behavior.

### Out of scope

- Any `@datafn/server` endpoint behavior changes.
- Any `@datafn/client` runtime behavior changes beyond what is required to compile against new core types.

### Deliverables (explicit files/modules)

- Modify: `datafn/core/src/types.ts`
- Add: `datafn/core/src/envelope.ts`
- Modify: `datafn/core/src/index.ts`
- Add/Modify tests under: `datafn/core/__tests__/`
- If required for compilation: update core-dependent type shims (e.g. `datafn/server/src/types/datafn-core.d.ts`)

### Requirements covered

- CORE-ENV-001
- CORE-EVENT-001
- CORE-UTIL-001

### Implementation tasks (ordered checklist)

- Add `unwrapEnvelope<T>(env: DatafnEnvelope<T>): T` with exact-throw semantics.
- Export `unwrapEnvelope` from `@datafn/core`.
- Extend `DatafnEvent` with `action?: string`, `fields?: string[]`, and ensure `timestampMs` remains required.
- Extend `DatafnEventFilter` with `action`, `fields`, and `contextKeys` dimensions.
- Add unit tests:
  - ok:true returns result
  - ok:false throws exact error object
  - event/filter types compile and match expected shapes

### Verification steps

From repo root (`/Users/ar/dev/superfunctions`):

```bash
npm test -- --filter=@datafn/core
```

Expected outcome:

- All `@datafn/core` tests pass.

Recommended compilation guard (ensures downstream packages compile with new core types):

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- `@datafn/client` tests compile and pass (or fail only for explicitly deferred later phases; such failures must be fixed in this phase if caused by type breakage).

### Stop condition

Report:

- The exported signature of `unwrapEnvelope`
- The final `DatafnEvent` and `DatafnEventFilter` type shapes
- Verification command outputs (pass/fail)

