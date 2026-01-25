## Phase 05

### Phase goal (1 sentence)

Fix REST wrapper determinism: inject schema versions, parse inputs deterministically, and require deterministic mutation metadata (no clock/random fallbacks).

### In scope

- Inject `version` from schema for REST-generated DFQL payloads.
- Deterministically parse `q` for GET wrapper and reject invalid JSON with `details.path:"q"`.
- Require `clientId` and `mutationId` for REST mutation wrappers (POST/PATCH/DELETE), and reject when missing.

### Out of scope

- Any new REST routes beyond those already generated.
- GraphQL generation.

### Deliverables (explicit files/modules)

- Modify: `datafn/server/src/routes/rest.ts`
- Modify tests:
  - `datafn/server/__tests__/rest.test.ts`

### Requirements covered

- REST-001
- REST-002
- REST-003
- REST-004

### Implementation tasks (ordered checklist)

- Replace any hard-coded `version: 1` with schema-derived `resource.version`.
- GET wrapper:
  - Parse `q` as URL-decoded JSON
  - Default missing `q` to `{}`
  - Invalid JSON returns `ok:false DFQL_INVALID "Invalid JSON" details.path:"q"`
- Mutation wrappers:
  - Require deterministic `clientId` and `mutationId` (from query string or body; exact source documented in updated README/spec)
  - Reject when missing with deterministic `DFQL_INVALID` and paths (`clientId`, `mutationId`)
  - Remove any fallback generation using `Date.now()` or random values
- POST wrapper default operation:
  - When `operation` is absent, default to DFQL `merge`
  - If `operation:"insert"` is explicitly provided and the id already exists, surface a deterministic conflict error (result-level)

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/server
```

Expected outcome:

- All server tests pass.
- REST vectors validated:
  - `TV-REST-VERSION-001`, `TV-REST-VERSION-002`
  - `TV-REST-META-001`, `TV-REST-META-002`
  - `TV-REST-QUERY-001`, `TV-REST-QUERY-002`
  - `TV-REST-POST-DEFAULT-001`, `TV-REST-POST-DEFAULT-002`

### Stop condition

Report:

- The final REST wrapper sources of `clientId` and `mutationId`
- Test run result for `@datafn/server`

