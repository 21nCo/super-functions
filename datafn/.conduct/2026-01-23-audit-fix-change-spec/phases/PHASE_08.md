## Phase 08

### Phase goal (1 sentence)

Make signal caching canonical by replacing duplicated `dfqlKey` logic in `@datafn/client` with `@datafn/core.dfqlKey`.

### In scope

- Remove/replace client-local `dfqlKey` implementation.
- Ensure `SignalRegistry` keys are derived from `@datafn/core.dfqlKey`.
- Add a unit test that verifies delegation to `@datafn/core.dfqlKey` (spy/assert).

### Out of scope

- Any changes to signal invalidation semantics (only keying and determinism).

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/signals/querySignal.ts`
- Modify tests:
  - `datafn/client/__tests__/signals.test.ts`

### Requirements covered

- CLIENT-SIGNAL-001

### Implementation tasks (ordered checklist)

- Replace any local key-normalization helpers with imports from `@datafn/core`:
  - `dfqlKey` (and `normalizeDfql` if needed)
- Ensure semantically equivalent queries map to the same cache key and object identity.
- Add/extend tests:
  - object identity for different key ordering
  - spy/expect `@datafn/core.dfqlKey` called at least once

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Signal vectors validated:
  - `TV-CLIENT-SIGNAL-001`
  - `TV-CLIENT-SIGNAL-002`

### Stop condition

Report:

- The exact import path used for canonical `dfqlKey`
- Test run result for `@datafn/client`

