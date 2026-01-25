## Phase 14

### Phase goal (1 sentence)

Bring the Python `datafn` package to server-SDK parity: real `/datafn/*` routes with deterministic envelope semantics and core sync/idempotency invariants.

### In scope

- Implement `create_datafn_server(config)` returning an object with routable endpoints:
  - `/datafn/status`
  - `/datafn/query`
  - `/datafn/mutation`
  - `/datafn/transact`
  - `/datafn/seed`
  - `/datafn/clone`
  - `/datafn/pull`
  - `/datafn/push`
- Implement canonical envelope semantics:
  - invalid JSON → `DFQL_INVALID "Invalid JSON" path:"$"`
  - request-level validation errors → deterministic `DFQL_INVALID` with `details.path`
- Implement idempotency keys `(namespace, clientId, mutationId)` using the Python DB adapter.

### Out of scope

- A Python local-first client runtime (this SDK is server-only).
- Full parity of the in-memory DFQL query engine beyond what is required for endpoint contract tests (server may delegate to DB adapter operations where available).

### Deliverables (explicit files/modules)

- Modify: `datafn/python/datafn/server.py`
- Add (recommended): `datafn/python/datafn/envelope.py`, `datafn/python/datafn/schema.py`, `datafn/python/datafn/routes/*.py`
- Modify: `datafn/python/datafn/__init__.py`
- Modify: `datafn/python/pyproject.toml` (add dependencies on `superfunctions` python packages if needed)
- Modify tests:
  - `datafn/python/tests/test_server.py`
  - add parity tests for invalid JSON, idempotency, and route exposure

### Requirements covered

- PY-SDK-001
- PY-SDK-002

### Implementation tasks (ordered checklist)

- Define Python equivalents of:
  - `DatafnEnvelope`
  - `DatafnError` with `{ code, message, details:{ path } }`
- Implement deterministic JSON parsing:
  - invalid JSON → fixed error message/path
- Implement schema validation:
  - reject invalid schema deterministically (`SCHEMA_INVALID`)
- Implement routing surface:
  - return `superfunctions.http.Route[]` (or adapter-agnostic equivalent used in the repo)
- Implement idempotency store using the Python DB adapter:
  - store results keyed by `(namespace, clientId, mutationId)`
  - dedupe across restarts where adapter preserves state
- Add tests validating vectors:
  - `TV-PY-001`, `TV-PY-002`
  - `TV-PY-PARITY-001`, `TV-PY-PARITY-002`

### Verification steps

From repo root:

```bash
cd datafn/python && python -m pytest
```

Expected outcome:

- All python tests pass.

### Stop condition

Report:

- The new Python server API surface (config + returned routes)
- A brief parity checklist (envelopes + invalid JSON + idempotency)
- Test run result for python

