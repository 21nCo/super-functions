## Phase goal

Complete client ecosystem surfaces: execute client plugins and support richer subscription filtering (`action`, `fields`, `contextKeys`).

---

## In scope

- Extend `@datafn/core` event/filter types (SUB-EXTRA-001).
- Execute client plugin hooks with deterministic ordering and fail-open/closed defaults (PLUG-CLIENT-001).
- Emit `action` and `fields` on `mutation_applied` events where derivable.
- Support subscription filters by `action` and `fields`.

## Out of scope

- Storage/offline behavior (Phase 17+).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/core/src/types.ts` (event/filter extensions)
- `superfunctions/datafn/client/src/*` (plugin runner + event filter logic)

Add:
- `superfunctions/datafn/client/__tests__/plugins.test.ts`
- `superfunctions/datafn/client/__tests__/subscriptions-extra.test.ts`

---

## Requirements covered

- PLUG-CLIENT-001
- SUB-EXTRA-001

---

## Implementation tasks

- [ ] Update `DatafnEvent` and `DatafnEventFilter`:
  - [ ] Add `action?: string`, `fields?: string[]`, `contextKeys?: string[]` filter support
  - [ ] Define filter semantics (intersection for fields, exact match/any for action arrays)
- [ ] Implement client plugin runner:
  - [ ] beforeQuery / afterQuery
  - [ ] beforeMutation / afterMutation
  - [ ] beforeSync / afterSync
  - [ ] Enforce determinism constraints (no reordering by default)
- [ ] Emit richer event metadata:
  - [ ] `action` from mutation operation
  - [ ] `fields` from `record` keys (sorted)
- [ ] Add tests implementing:
  - [ ] `TV-PLUG-CLIENT-001`, `TV-PLUG-CLIENT-002`
  - [ ] `TV-SUB-EXTRA-001`, `TV-SUB-EXTRA-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Plugin/subscription vectors pass exactly.

---

## Stop condition

Report:
- Client plugins execute deterministically.
- Subscriptions support action/fields filtering and events include required metadata.

