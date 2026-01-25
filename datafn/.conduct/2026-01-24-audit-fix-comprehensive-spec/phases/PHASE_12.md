# PHASE_12: Python Transact Endpoint

## Phase Goal

Implement Python server transact endpoint with atomic transaction wrapping, query+mutation steps, and step limits matching TypeScript server semantics.

## In Scope

- POST /datafn/transact endpoint (Python)
- Atomic transaction wrapping (begin/commit/rollback)
- Query steps (read transaction state)
- Mutation steps (all operations)
- maxTransactSteps limit enforcement
- Read-your-writes within transaction

## Out of Scope

- Python sync endpoints (covered in PHASE_13)
- Distributed transactions
- Savepoints

## Deliverables

- `python/datafn/handlers/transact.py` - Transact endpoint
- `python/datafn/transaction.py` - Transaction helper
- `python/datafn/server.py` - Add transact route
- `python/tests/test_transact.py` - Transact tests

## Requirements Covered

- **PY-003**: Python transact endpoint implementation (P1)

## Implementation Tasks

- [ ] Verify Python DB adapter supports transactions:
  - [ ] SQLAlchemy: use `session.begin()` / `commit()` / `rollback()`
  - [ ] Document transaction API requirements
- [ ] Create python/datafn/transaction.py:
  - [ ] `with_transaction(db, callback)`:
    - [ ] Begin transaction
    - [ ] Execute callback
    - [ ] On success: commit
    - [ ] On error: rollback and raise
    - [ ] Return callback result
- [ ] Create python/datafn/handlers/transact.py:
  - [ ] `handle_transact(request, config)`:
    - [ ] Parse JSON body (return DFQL_INVALID on failure)
    - [ ] Call authorize(ctx, "transact", payload)
    - [ ] If denied: return FORBIDDEN
    - [ ] Validate steps.length <= maxTransactSteps
    - [ ] If exceeded: return LIMIT_EXCEEDED
    - [ ] If atomic is True:
      - [ ] Execute with_transaction(db, execute_steps)
      - [ ] On error: rollback (via with_transaction)
      - [ ] Return results
    - [ ] If atomic is False:
      - [ ] Execute steps without transaction
      - [ ] Continue on failures
      - [ ] Return partial results
  - [ ] `execute_steps(db, schema, steps, context)`:
    - [ ] For each step:
      - [ ] If step has "query": execute query (reuse query handler logic)
      - [ ] If step has "mutation": execute mutation (reuse mutation handler logic)
      - [ ] Collect result
    - [ ] Return results array
  - [ ] Query steps read from transaction state (uncommitted writes visible)
  - [ ] Mutation steps modify transaction state
- [ ] Update python/datafn/server.py:
  - [ ] Add POST /datafn/transact → handle_transact
- [ ] Write tests in python/tests/test_transact.py:
  - [ ] atomic=True, first step fails → rollback, no changes
  - [ ] atomic=True, all steps succeed → commit, all changes applied
  - [ ] atomic=False, second step fails → first committed, second fails
  - [ ] Query step reads uncommitted writes (read-your-writes)
  - [ ] Mixed query+mutation steps work
  - [ ] Step limit enforced

## Verification Steps

### Automated Tests

```bash
# Run Python transact tests
cd python
python -m pytest tests/test_transact.py

# Expected: All tests pass
```

### Manual Verification

```bash
# Test atomic rollback
curl -X POST http://localhost:8000/datafn/transact \
  -H "Content-Type: application/json" \
  -d '{
    "atomic": true,
    "steps": [
      {"mutation":{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"insert","record":{"title":"Task 1"}}},
      {"mutation":{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-2","operation":"insert","record":{}}}
    ]
  }'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID",...}}
# Verify: No tasks created (rollback occurred)

# Test read-your-writes
curl -X POST http://localhost:8000/datafn/transact \
  -H "Content-Type: application/json" \
  -d '{
    "atomic": true,
    "steps": [
      {"mutation":{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-3","operation":"insert","record":{"title":"New Task","status":"pending"}}},
      {"query":{"resource":"tasks","version":"1","filters":{"status":"pending"}}}
    ]
  }'

# Expected: Query result includes newly inserted task
# {"ok":true,"result":{"ok":true,"results":[{"ok":true,"mutationId":"mut-3",...},{"data":[...],...}]}}

# Test step limit
curl -X POST http://localhost:8000/datafn/transact \
  -H "Content-Type: application/json" \
  -d '{
    "atomic": true,
    "steps": [/* 101 steps */]
  }'

# Expected: {"ok":false,"error":{"code":"LIMIT_EXCEEDED",...}}
```

### Test Vectors Verification

Run test vectors:
- TV-PY-TRANSACT-001
- TV-PY-TRANSACT-ATOMIC-001

Expected: All 2 vectors pass

### Contract Tests (Python vs TypeScript)

```bash
# Run parity tests comparing Python vs TS transact
python -m pytest tests/test_parity.py::test_transact_parity

# Expected: Python and TypeScript return identical responses for same inputs
```

## Stop Condition

Report completion when:
1. ✅ All Python transact tests pass
2. ✅ Manual verification confirms atomic rollback works
3. ✅ Test vectors TV-PY-TRANSACT-* pass
4. ✅ Query steps read transaction state
5. ✅ Step limits enforced
6. ✅ Parity tests confirm Python matches TypeScript

**Estimated Duration**: 2-3 days

**Dependencies**: PHASE_11 (Python query/mutation), PHASE_06 (TypeScript transact semantics)

**Blocks**: PHASE_13 (Python sync)
