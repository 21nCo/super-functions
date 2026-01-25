## Phase 13

### Phase goal (1 sentence)

Make `@datafn/cli` reject invalid schemas deterministically by correctly handling `validateSchema` envelopes (via `unwrapEnvelope`) in codegen and migrations.

### In scope

- Update CLI code paths to use `unwrapEnvelope(validateSchema(schema))` (or equivalent).
- Ensure deterministic thrown errors for invalid schema inputs across:
  - codegen
  - migrations diff/render
- Update/extend CLI tests to cover invalid schema handling deterministically.

### Out of scope

- Adding new codegen features beyond determinism and validation correctness.

### Deliverables (explicit files/modules)

- Modify: `datafn/cli/src/codegen.ts`
- Modify: `datafn/cli/src/migrations/diff.ts`
- Modify (if needed): `datafn/cli/src/migrations/render-postgres.ts`
- Modify tests:
  - `datafn/cli/__tests__/codegen.test.ts`
  - `datafn/cli/__tests__/migrations.test.ts`

### Requirements covered

- CLI-VALIDATE-001
- CLI-CODEGEN-001
- CLI-MIG-001

### Implementation tasks (ordered checklist)

- Replace any “ignore envelope” schema validation calls with:
  - `const schema = unwrapEnvelope(validateSchema(input))`
- Ensure thrown error object:
  - has `code:"SCHEMA_INVALID"`
  - has deterministic `details.path`
- Add tests:
  - invalid schema is rejected deterministically (`TV-CLI-VALIDATE-001`)
  - valid schema is accepted (`TV-CLI-VALIDATE-002`)
  - codegen deterministic output unchanged (`TV-CODEGEN-001`)
  - migration plan determinism unchanged (`TV-MIG-001`)

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/cli
```

Expected outcome:

- All CLI tests pass.

### Stop condition

Report:

- The deterministic error thrown on invalid schema input (code/message/path)
- Test run result for `@datafn/cli`

