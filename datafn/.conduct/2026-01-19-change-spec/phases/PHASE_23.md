## Phase goal

Deliver deterministic TypeScript code generation from a `DatafnSchema` to typed record types and typed client/table handles.

---

## In scope

- Provide a codegen module/CLI (CODEGEN-TS-001).
- Ensure output is deterministic for a schema.
- Reject invalid schema deterministically.

## Out of scope

- Runtime schema inference without codegen.
- Generating GraphQL APIs (optional; out of scope).

---

## Deliverables (files to create/modify)

Add (example shape; exact package name may vary):
- `superfunctions/datafn/cli/src/codegen.ts`
- `superfunctions/datafn/cli/src/index.ts`
- `superfunctions/datafn/cli/__tests__/codegen.test.ts`

---

## Requirements covered

- CODEGEN-TS-001

---

## Implementation tasks

- [ ] Implement schema validation via `@datafn/core.validateSchema` before generation.
- [ ] Generate:
  - [ ] `export interface <PascalCase>` per resource
  - [ ] `export type Tables = { ... }`
  - [ ] `export type TypedClient = DatafnClient & { ... }`
- [ ] Ensure deterministic output:
  - [ ] Stable ordering by resource name.
  - [ ] Stable ordering by field name.
- [ ] Add tests implementing:
  - [ ] `TV-CODEGEN-001`, `TV-CODEGEN-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/cli
```

Expected outcome:
- Codegen vectors pass exactly.

---

## Stop condition

Report:
- Codegen produces stable output and rejects invalid schema deterministically.

