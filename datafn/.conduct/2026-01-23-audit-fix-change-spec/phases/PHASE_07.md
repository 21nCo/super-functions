## Phase 07

### Phase goal (1 sentence)

Implement rich client event payloads and filtering: add `action/fields` metadata and emit `mutation_rejected` on thrown remote errors while supporting `action/fields/contextKeys` filters.

### In scope

- Enrich emitted mutation events with:
  - `action` (mutation.operation)
  - `fields` (deterministic derivation from mutation record keys)
- Emit `mutation_rejected` for thrown remote errors (not just ok:false envelopes).
- Extend `matchesFilter` to support:
  - `action`
  - `fields` intersection
  - `contextKeys` presence checks

### Out of scope

- Signal cache-key refactor to core dfqlKey (Phase 08).
- Offline query expansion (Phase 10).

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/mutate.ts`
- Modify: `datafn/client/src/events/filter.ts`
- Modify tests:
  - `datafn/client/__tests__/events.test.ts`
  - `datafn/client/__tests__/mutate.test.ts`
  - `datafn/client/__tests__/subscribe.test.ts` (if filter dimensions are validated here)

### Requirements covered

- CLIENT-EVENT-001
- CLIENT-FILTER-001

### Implementation tasks (ordered checklist)

- Define deterministic `fields` derivation rules:
  - For `insert/merge/replace`: use sorted keys of provided record(s) excluding `id`
  - For `delete`: `fields` omitted or empty array
- Ensure `mutation_rejected` emission happens in both cases:
  - remote returns a failure envelope
  - remote throws (transport error, fetch error)
- Update `matchesFilter`:
  - action: string or any-of array
  - fields: any-of intersection (non-empty)
  - contextKeys: all required keys exist on `event.context` when it is a plain object
- Add tests for:
  - action/fields emission
  - thrown remote error emits mutation_rejected
  - filter semantics for action/fields/contextKeys

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Vectors validated:
  - `TV-CLIENT-EVENT-001`, `TV-CLIENT-EVENT-002`
  - `TV-CLIENT-FILTER-001`, `TV-CLIENT-FILTER-002`

### Stop condition

Report:

- The final rules for deriving `event.fields`
- Evidence that thrown remote errors produce `mutation_rejected`
- Test run result for `@datafn/client`

