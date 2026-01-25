## Phase goal

Expose schema-driven REST wrappers for DFQL query/mutation (`/datafn/resources/*`) as described by the original spec.

---

## In scope

- Implement REST wrappers:
  - `GET /datafn/resources/:table` → query wrapper
  - `POST /datafn/resources/:table` → insert/merge wrapper
  - `PATCH /datafn/resources/:table/:id` → merge wrapper
  - `DELETE /datafn/resources/:table/:id` → delete wrapper
- Deterministic parameter encoding via `q=<urlencoded-json>` (API-GEN-REST-001).

## Out of scope

- GraphQL generation (optional; API-GEN-GQL-001 is SHOULD).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/server.ts` (add REST routes)

Add:
- `superfunctions/datafn/server/src/routes/rest.ts`
- `superfunctions/datafn/server/__tests__/rest.test.ts`

---

## Requirements covered

- API-GEN-REST-001

---

## Implementation tasks

- [ ] Implement query wrapper:
  - [ ] Parse `q` query param as JSON (or `{}` if omitted).
  - [ ] Inject `resource` and schema `version`.
  - [ ] Delegate to DFQL query execution.
- [ ] Implement mutation wrappers:
  - [ ] Map REST verbs to DFQL mutation operations.
  - [ ] Inject `resource` and `version`.
- [ ] Deterministic errors on unknown resources.
- [ ] Add tests implementing:
  - [ ] `TV-REST-001`, `TV-REST-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- REST wrapper vectors pass exactly.

---

## Stop condition

Report:
- REST wrappers exist and match the DFQL semantics as the single source of truth.

