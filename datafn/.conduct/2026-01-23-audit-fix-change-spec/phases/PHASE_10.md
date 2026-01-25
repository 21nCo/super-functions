## Phase 10

### Phase goal (1 sentence)

Implement full deterministic local DFQL query execution for `ready` tables so offline/local-first queries match server semantics (filters/sort/pagination/select/omit/relations/count/groupBy).

### In scope

- Expand local query execution beyond the current minimal subset.
- Ensure local execution covers the DFQL feature set required by `CLIENT-OFFLINE-QUERY-001`.
- Add tests that validate local semantics and parity with server semantics for a fixed dataset.

### Out of scope

- Offline mutation semantics hardening (Phase 11).
- Any DB-backed server execution changes (server already implements most DFQL query features).

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/offline/query.ts`
- Modify: `datafn/client/src/query.ts`
- Add (recommended for shared semantics): `datafn/core/src/query/execute.ts` (pure execution) and supporting modules
- Modify tests:
  - `datafn/client/__tests__/offline-query.test.ts`
  - Add parity-focused tests comparing local vs server execution for identical DFQL (new)

### Requirements covered

- CLIENT-OFFLINE-QUERY-001

### Implementation tasks (ordered checklist)

- Define the supported local DFQL subset for v0 as “matches server query engine features” for:
  - select tokens (including relation expansions, omit)
  - filters (dot-path, relation quantifiers, operator set including `$in`/`in` aliases)
  - sort (deterministic tie-breaker)
  - pagination (limit/offset + cursor after/before)
  - count
  - groupBy/aggregations/having (if already supported server-side)
- Implement local execution:
  - Use `DatafnStorageAdapter` as the data source (records + join rows)
  - Ensure deterministic ordering (`id:asc` tie-breaker)
- Add tests:
  - local ready does not call remote (`TV-OFFLINE-QUERY-001`)
  - hydrating routes remote (`TV-OFFLINE-QUERY-002`)
  - additional new tests for local DFQL semantics (filters/sort/pagination/relations)

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Offline query vectors validated:
  - `TV-OFFLINE-QUERY-001`
  - `TV-OFFLINE-QUERY-002`

### Stop condition

Report:

- The implemented local DFQL feature coverage list (explicit)
- Any known gaps (should be none for the required set)
- Test run result for `@datafn/client`

