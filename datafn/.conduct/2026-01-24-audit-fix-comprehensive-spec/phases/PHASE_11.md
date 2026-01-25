# PHASE_11: Python Query and Mutation Endpoints

## Phase Goal

Implement Python server query and mutation endpoints with schema-bounded validation, idempotency, guard enforcement, relation mutations, and invalid JSON determinism matching TypeScript server.

## In Scope

- POST /datafn/query endpoint (Python)
- POST /datafn/mutation endpoint (Python)
- Schema-bounded validation (Python)
- Idempotency persistence (Python)
- Guard enforcement (Python)
- Relation mutations (Python)
- Invalid JSON determinism (Python)
- DatafnEnvelope responses (Python)

## Out of Scope

- Python transact (covered in PHASE_12)
- Python sync endpoints (covered in PHASE_13)
- Python client (server-only)

## Deliverables

- `python/datafn/handlers/query.py` - Query endpoint
- `python/datafn/handlers/mutation.py` - Mutation endpoint
- `python/datafn/validation.py` - Schema validation
- `python/datafn/idempotency.py` - Idempotency persistence
- `python/datafn/guards.py` - Guard evaluation
- `python/datafn/relations.py` - Relation mutations
- `python/datafn/server.py` - Updated server creation
- `python/tests/test_query.py` - Query tests
- `python/tests/test_mutation.py` - Mutation tests
- `python/tests/test_parity.py` - TS parity tests

## Requirements Covered

- **PY-001**: Python query endpoint implementation (P1)
- **PY-002**: Python mutation endpoint implementation (P1)
- **PY-005**: Python invalid JSON determinism (P1)
- **PY-006**: Python idempotency persistence (P1)

## Implementation Tasks

### Foundation

- [ ] Update python/datafn/envelope.py:
  - [ ] Ensure `ok_response(result)` returns `{"ok": True, "result": result}`
  - [ ] Ensure `error_response(error)` returns `{"ok": False, "error": error}`
  - [ ] Error dict includes `code`, `message`, `details` with `path`
- [ ] Create python/datafn/validation.py:
  - [ ] `validate_resource(schema, resource_name)` → returns error or None
  - [ ] `validate_fields(schema, resource_name, field_names)` → returns error or None
  - [ ] `validate_relation(schema, resource_name, relation_name)` → returns error or None
  - [ ] Error codes match TypeScript: DFQL_UNKNOWN_RESOURCE, DFQL_UNKNOWN_FIELD, DFQL_UNKNOWN_RELATION

### Query Endpoint

- [ ] Create python/datafn/handlers/query.py:
  - [ ] `handle_query(request, config)`:
    - [ ] Parse JSON body (return DFQL_INVALID on failure)
    - [ ] Call authorize(ctx, "query", payload)
    - [ ] If denied: return FORBIDDEN
    - [ ] Validate query against schema
    - [ ] Execute query via DB adapter
    - [ ] Return ok_response with { data, count?, nextCursor? }
  - [ ] Error handling: classify errors like TypeScript server
  - [ ] Support batch queries (array input)

### Mutation Endpoint

- [ ] Create python/datafn/idempotency.py:
  - [ ] `check_idempotency(db, namespace, client_id, mutation_id)` → returns cached result or None
  - [ ] `store_idempotency(db, namespace, client_id, mutation_id, result)` → stores result
  - [ ] Use __datafn_idempotency table matching TypeScript schema
- [ ] Create python/datafn/guards.py:
  - [ ] `evaluate_guard(db, resource, record_id, guard_filter)` → returns match: bool
  - [ ] Fetch current record
  - [ ] Apply guard filter (reuse filter evaluation logic)
  - [ ] Return match result
- [ ] Create python/datafn/relations.py:
  - [ ] `execute_relate(db, schema, mutation)` → applies relation
  - [ ] `execute_modify_relation(db, schema, mutation)` → updates metadata
  - [ ] `execute_unrelate(db, schema, mutation)` → removes relation
  - [ ] Match TypeScript relation semantics
- [ ] Create python/datafn/handlers/mutation.py:
  - [ ] `handle_mutation(request, config)`:
    - [ ] Parse JSON body (return DFQL_INVALID on failure)
    - [ ] Call authorize(ctx, "mutation", payload)
    - [ ] If denied: return FORBIDDEN
    - [ ] Check idempotency
    - [ ] If replayed: return cached result with deduped flag
    - [ ] Validate mutation against schema
    - [ ] If guard present: evaluate guard
    - [ ] If guard fails: return CONFLICT
    - [ ] Execute mutation (insert/merge/replace/delete/relate/modifyRelation/unrelate)
    - [ ] Store idempotency result
    - [ ] Return ok_response with { ok, mutationId, affectedIds }

### Server Integration

- [ ] Update python/datafn/server.py:
  - [ ] `create_datafn_server(config)` returns server with routes:
    - [ ] POST /datafn/query → handle_query
    - [ ] POST /datafn/mutation → handle_mutation
  - [ ] Middleware for JSON parsing before auth (match TypeScript ordering)
  - [ ] Framework adapters for FastAPI/Flask

### Tests

- [ ] Write python/tests/test_query.py:
  - [ ] Query with valid request returns data
  - [ ] Query with invalid JSON returns DFQL_INVALID
  - [ ] Query with unknown resource returns DFQL_UNKNOWN_RESOURCE
  - [ ] Query denied by auth returns FORBIDDEN
- [ ] Write python/tests/test_mutation.py:
  - [ ] Mutation with valid request applies change
  - [ ] Mutation replayed returns cached result
  - [ ] Mutation with guard mismatch returns CONFLICT
  - [ ] Mutation with invalid JSON returns DFQL_INVALID
  - [ ] Relation mutations work correctly
- [ ] Write python/tests/test_parity.py:
  - [ ] Contract tests: Python vs TypeScript responses match
  - [ ] Use same inputs, compare JSON outputs

## Verification Steps

### Automated Tests

```bash
# Run Python tests
cd python
python -m pytest tests/test_query.py tests/test_mutation.py tests/test_parity.py

# Expected: All tests pass
```

### Manual Verification

```bash
# Start Python server
python -m datafn.server

# Test query
curl -X POST http://localhost:8000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{}}'

# Expected: {"ok":true,"result":{"data":[...],"nextCursor":null}}

# Test mutation
curl -X POST http://localhost:8000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"insert","record":{"title":"Task"}}'

# Expected: {"ok":true,"result":{"ok":true,"mutationId":"mut-1","affectedIds":[...]}}

# Test invalid JSON
curl -X POST http://localhost:8000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{invalid json}'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID","message":"Invalid JSON","details":{"path":"$"}}}
```

### Test Vectors Verification

Run test vectors:
- TV-PY-QUERY-001
- TV-PY-QUERY-INVALID-001
- TV-PY-MUTATION-001
- TV-PY-MUTATION-GUARD-001
- TV-PY-MUTATION-IDEMP-001
- TV-PY-INV-JSON-001

Expected: All 6 vectors pass

## Stop Condition

Report completion when:
1. ✅ All Python tests pass
2. ✅ Manual verification confirms endpoints work
3. ✅ Test vectors TV-PY-* pass
4. ✅ Parity tests confirm Python matches TypeScript responses
5. ✅ Invalid JSON determinism matches TypeScript
6. ✅ Idempotency works across server restarts

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_01 (validation patterns), PHASE_03 (guards), PHASE_05 (relations)

**Blocks**: PHASE_12 (Python transact)
