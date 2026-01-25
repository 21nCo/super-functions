## Phase goal

Add the Python server-only SDK package `datafn` with parity for mounting `/datafn/*` endpoints.

---

## In scope

- Python package `datafn` exists and can be imported (PY-SDK-001).
- `create_datafn_server(...)` returns a route list compatible with a Python HTTP adapter.
- Schema validation errors are deterministic and match TS semantics.

## Out of scope

- Python client runtime (server-only).

---

## Deliverables (files to create/modify)

Add (example layout):
- `superfunctions/datafn/python/datafn/__init__.py`
- `superfunctions/datafn/python/datafn/server.py`
- `superfunctions/datafn/python/tests/test_server.py`

---

## Requirements covered

- PY-SDK-001

---

## Implementation tasks

- [ ] Define Python route objects for:
  - [ ] `/datafn/status`
  - [ ] `/datafn/query`
  - [ ] `/datafn/mutation`
  - [ ] `/datafn/transact`
  - [ ] `/datafn/seed`
  - [ ] `/datafn/clone`
  - [ ] `/datafn/pull`
  - [ ] `/datafn/push`
- [ ] Match request/response semantics from TS server (`DatafnEnvelope`-wrapped).
- [ ] Implement schema validation using a Python port of `validateSchema` (or call into shared JSON schema validation).
- [ ] Add tests implementing:
  - [ ] `TV-PY-001`, `TV-PY-002`

---

## Verification steps

- Run:

```bash
cd superfunctions/datafn/python
python -m pytest
```

Expected outcome:
- Python vectors pass exactly.

---

## Stop condition

Report:
- Python SDK mounts the canonical endpoints with deterministic schema validation behavior.

