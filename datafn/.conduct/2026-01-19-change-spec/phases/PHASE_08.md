## Phase goal

Make `@datafn/server` safe for client consumption by standardizing endpoint envelopes, advertising accurate capabilities in `/datafn/status`, and forwarding authorization payloads.

---

## In scope

- All `/datafn/*` endpoints return top-level `DatafnEnvelope` and use `ok:false` for request-level failures (SERVER-ENVELOPE-001).
- `/datafn/status` advertises the fixed capability set and fails `INTERNAL` when DB is unhealthy (SERVER-STATUS-001).
- `authorize(ctx, action, payload)` receives the parsed request payload (SERVER-AUTH-001).

## Out of scope

- Durable sync ordering / `serverSeq` change tracking (Phase 09).
- Plugin hook execution (Phase 10).
- DFQL completeness work (Phase 11+).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/server.ts` (auth wrapper passes payload)
- `superfunctions/datafn/server/src/routes/status.ts` (capabilities + DB health)
- `superfunctions/datafn/server/src/routes/sync.ts` (top-level `ok:false` on invalid JSON / validation errors)

Add:
- `superfunctions/datafn/server/__tests__/envelopes-status-auth.test.ts`

---

## Requirements covered

- SERVER-ENVELOPE-001
- SERVER-STATUS-001
- SERVER-AUTH-001

---

## Implementation tasks

- [ ] Update the server auth wrapper:
  - [ ] For `POST` endpoints, parse JSON once and pass the parsed body as `payload` to `authorize`.
  - [ ] For `GET /datafn/status`, call `authorize` with `payload:null`.
- [ ] Standardize sync route error handling:
  - [ ] Invalid JSON returns `{ ok:false, error:{ code:"DFQL_INVALID", message:"Invalid JSON", details:{ path:"$" } } }`.
  - [ ] Missing required fields return `{ ok:false, error:{ code:"DFQL_INVALID", ... } }` with deterministic `details.path`.
- [ ] Update `/datafn/status`:
  - [ ] When DB adapter is healthy, include full capability set.
  - [ ] When DB adapter is unhealthy, return `ok:false` with `INTERNAL`.
- [ ] Add tests implementing:
  - [ ] `TV-SERVER-ENV-001`, `TV-SERVER-ENV-002`
  - [ ] `TV-STATUS-001`, `TV-STATUS-002`
  - [ ] `TV-AUTH-001`, `TV-AUTH-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Envelope/status/auth vectors pass exactly.

---

## Stop condition

Report:
- Server endpoints use consistent `DatafnEnvelope` error semantics.
- `/datafn/status` advertises the required capabilities and gates on DB health.
- `authorize` sees the real request payload for POST routes.

