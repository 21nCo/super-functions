## Phase goal

Add `POST /datafn/seed` to `@datafn/server` with deterministic validation and canonical envelope response.

---

## In scope

- New route `POST /datafn/seed`.
- Request validation: body object with `clientId: string`.
- Success response: `{ ok:true, result:{ ok:true } }`.
- Error response: `{ ok:false, error:{ code:"DFQL_INVALID", message:"Invalid DFQL: clientId must be string", details:{ path:"clientId" } } }`.
- Tests for `TV-SEED-001` and `TV-SEED-002`.

## Out of scope

- Actual dataset initialization semantics (what gets created).
- Authentication/session modeling for seed.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/server.ts` (register the route)

Add:
- `superfunctions/datafn/server/src/routes/seed.ts`
- `superfunctions/datafn/server/__tests__/seed.test.ts`

---

## Requirements covered

- SERVER-SEED-001

---

## Implementation tasks

- [ ] Create `src/routes/seed.ts` with `createSeedHandler(...)`:
  - [ ] Parse JSON body.
  - [ ] Validate body is an object and `clientId` is a string.
  - [ ] On success return `okResponse({ ok: true })`.
  - [ ] On failure return `errorResponse({ code:"DFQL_INVALID", message:"Invalid DFQL: clientId must be string", details:{ path:"clientId" } })`.
- [ ] Register the route in `createDatafnServer`:
  - [ ] Add `{ method:"POST", path:"/datafn/seed", handler: withAuth("seed", seedHandler) }`.
- [ ] Add tests in `__tests__/seed.test.ts`:
  - [ ] Assert `TV-SEED-001` and `TV-SEED-002` outputs exactly.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- `TV-SEED-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirm `/datafn/seed` exists and returns canonical envelopes with deterministic errors.

