## Phase goal

Provide deterministic schema migration tooling (diff + script generation) for supported databases.

---

## In scope

- Schema diff tool produces a deterministic migration plan (MIG-001).
- Migration plan can be rendered to a DB-specific script (Postgres first).

## Out of scope

- Automatic application of migrations in production (deployment concern).

---

## Deliverables (files to create/modify)

Add (example shape; exact package name may vary):
- `superfunctions/datafn/cli/src/migrations/diff.ts`
- `superfunctions/datafn/cli/src/migrations/plan.ts`
- `superfunctions/datafn/cli/src/migrations/render-postgres.ts`
- `superfunctions/datafn/cli/__tests__/migrations.test.ts`

---

## Requirements covered

- MIG-001

---

## Implementation tasks

- [ ] Validate input schemas using `@datafn/core.validateSchema`.
- [ ] Compute migration plan:
  - [ ] Resource add/remove
  - [ ] Field add/remove/type change
  - [ ] Relation add/remove
- [ ] Render Postgres scripts deterministically from plan.
- [ ] Add tests implementing:
  - [ ] `TV-MIG-001`, `TV-MIG-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/cli
```

Expected outcome:
- Migration vectors pass exactly.

---

## Stop condition

Report:
- Migration diff and render tooling exists with deterministic output.

