## Phase goal

Replace the memory-only server store with `@superfunctions/db.Adapter`-backed persistence for records, and make idempotency durable across restarts.

---

## In scope

- `createDatafnServer({ db })` accepts a `@superfunctions/db.Adapter`.
- Server calls `db.initialize()` and includes adapter health in `/datafn/status`.
- Query and mutation execution run against the adapter (at least for base record CRUD).
- Idempotency dedupe uses adapter-backed storage (not in-memory).

## Out of scope

- Full DFQL-to-SQL compilation for every DFQL feature (relations/htree/search/groupBy can remain separate later phases).
- Sync cursor/tombstone persistence (can be a follow-on phase if needed).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/server.ts`
- `superfunctions/datafn/server/src/routes/status.ts`
- `superfunctions/datafn/server/src/routes/query.ts`
- `superfunctions/datafn/server/src/routes/mutation.ts`
- `superfunctions/datafn/server/src/execution/idempotency.ts`

Add:
- `superfunctions/datafn/server/src/execution/db-adapter.ts` (adapter-backed store helpers)
- `superfunctions/datafn/server/src/execution/idempotency-db.ts`
- `superfunctions/datafn/server/__tests__/db-adapter.test.ts`
- `superfunctions/datafn/server/__tests__/idempotency-db.test.ts`

---

## Requirements covered

- SERVER-DB-001
- SERVER-DB-002

---

## Implementation tasks

- [ ] Define a canonical internal namespace for datafn tables in the adapter (e.g. `namespace: "datafn"`).
- [ ] Implement adapter-backed record storage:
  - [ ] Use `adapter.create/findOne/findMany/update/delete` for resource tables.
  - [ ] For the in-memory adapter, rely on `model` naming consistency and `where` clauses.
- [ ] Implement adapter-backed idempotency:
  - [ ] Create an internal model/table `datafn_idempotency` with fields `clientId`, `mutationId`, `resultJson`, `createdAt`.
  - [ ] On mutation, upsert/look up dedupe via adapter.
- [ ] Update server factory:
  - [ ] If `db` is missing, return deterministic `INTERNAL` errors for endpoints instead of silently “working” in-memory.
  - [ ] Call `db.initialize()` at startup.
  - [ ] Update `/status` capabilities based on `db.isHealthy()`.
- [ ] Add tests asserting:
  - [ ] `TV-DB-001` and `TV-DB-002`
  - [ ] `TV-IDEMP-001` and `TV-IDEMP-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- `TV-DB-*` and `TV-IDEMP-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirmation that server endpoints operate using `@superfunctions/db.Adapter`.
- Confirmation that idempotency dedupe survives restart with preserved adapter state.

