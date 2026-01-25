## Phase 15

### Phase goal (1 sentence)

Update documentation so `@datafn/*` READMEs match the implemented APIs and the canonical client/server usage patterns.

### In scope

- Update:
  - `datafn/svelte/README.md`
  - `datafn/client/README.md`
  - `datafn/core/README.md`
  - `datafn/server/README.md`
- Ensure READMEs:
  - use `remote` (not obsolete `executor`) in client config
  - show canonical signals + Svelte store integration
  - describe `validateSchema` correctly (envelope-returning)
  - list canonical capability strings (`sync.*`)

### Out of scope

- Full documentation site work (only package READMEs).

### Deliverables (explicit files/modules)

- Modify: `datafn/svelte/README.md`
- Modify: `datafn/client/README.md`
- Modify: `datafn/core/README.md`
- Modify: `datafn/server/README.md`

### Requirements covered

- DOCS-SVELTE-001
- DOCS-CLIENT-001
- DOCS-CORE-001
- DOCS-SERVER-001

### Implementation tasks (ordered checklist)

- `@datafn/svelte` README:
  - include end-to-end example: `createDatafnClient` → `client.<table>.signal(query)` → `toSvelteStore`
  - ensure example is “happy path” (no manual signal wiring)
- `@datafn/client` README:
  - update config example to use `remote`
  - document plugin support and event filter dims (`action/fields/contextKeys`)
  - include sync + offline storage notes (including shipped adapters)
- `@datafn/core` README:
  - explain `validateSchema` returns `DatafnEnvelope`
  - document `unwrapEnvelope` and `dfqlKey`
  - document `DatafnEvent`/`DatafnEventFilter` fields
- `@datafn/server` README:
  - update to use `@superfunctions/db.Adapter`
  - document canonical envelopes and capability strings
  - document `rest:true` enabling and deterministic REST mutationId requirement

### Verification steps

Manual review using doc vectors:

- `TV-DOCS-SVELTE-001`, `TV-DOCS-SVELTE-002`
- `TV-DOCS-CLIENT-001`, `TV-DOCS-CLIENT-002`
- `TV-DOCS-CORE-001`, `TV-DOCS-CORE-002`
- `TV-DOCS-SERVER-001`, `TV-DOCS-SERVER-002`

Optional automated check (recommended):

```bash
node -e "const fs=require('fs'); const read=p=>fs.readFileSync(p,'utf8'); console.log(read('datafn/svelte/README.md').includes('toSvelteStore('));"
```

Expected outcome:

- Each README satisfies the “mustContain/mustNotContain” checks described in `TEST_VECTORS.md`.

### Stop condition

Report:

- A checklist showing each doc vector passes
- Any intentional wording deviations (should be none for API/signature facts)

