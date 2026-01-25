# PHASE_06: Atomic Transactions with Query Steps

## Phase Goal

Implement atomic transaction wrapping with rollback, support query+mutation steps, enforce step limits, and ensure read-your-writes semantics within transactions.

## In Scope

- Database transaction wrapping (begin/commit/rollback)
- atomic: true (rollback on first failure)
- atomic: false (partial commit allowed)
- Query steps in transact (read current transaction state)
- Mutation steps in transact (all operation types)
- maxTransactSteps limit enforcement
- Read-your-writes within transaction

## Out of Scope

- Distributed transactions (single DB only)
- Savepoints (full transaction only)
- Transaction-level guards (guards work per mutation step)

## Deliverables

- `server/src/execution/transact.ts` - Complete rewrite
- `server/src/routes/transact.ts` - Updated validation and limits
- `server/src/db/transaction.ts` - Transaction helper (new, if needed)
- `server/src/execution/__tests__/transact.test.ts` - Transact tests

## Requirements Covered

- **TX-ATOMIC-001**: Database transaction wrapping (P0)
- **TX-QUERY-001**: Query steps in transact (P0)
- **TX-LIMITS-001**: Transact step limits (P0)

## Implementation Tasks

- [x] Verify @superfunctions/db Adapter supports transactions:
  - [x] Check for begin(), commit(), rollback() methods
  - [x] If missing, add transaction methods to adapter interface
  - [x] Document transaction API requirements
- [x] Create server/src/db/transaction.ts (if needed):
  - [x] `withTransaction(adapter, callback)` → wraps callback in transaction
  - [x] Handles begin/commit/rollback
  - [x] Returns callback result or throws on error
- [x] Rewrite server/src/execution/transact.ts:
  - [x] `executeTransact(adapter, schema, request, context)`:
    - [x] Validate steps.length <= maxTransactSteps
    - [x] If atomic: true:
      - [x] Begin transaction
      - [x] Execute steps in order
      - [x] On first failure: rollback and return error
      - [x] On all success: commit and return results
    - [x] If atomic: false:
      - [x] Execute steps in order (no transaction)
      - [x] Continue on failures, collect results
      - [x] Return partial results
  - [x] `executeTransactStep(adapter, schema, step, context, inTransaction)`:
    - [x] If step.query: execute query against transaction state
    - [x] If step.mutation: execute mutation within transaction
    - [x] Return step result
  - [x] Query steps use transaction context (read uncommitted writes)
  - [x] Mutation steps modify transaction state
- [x] Update server/src/routes/transact.ts:
  - [x] Add step limit validation:
    - [x] If steps.length > config.limits.maxTransactSteps: return LIMIT_EXCEEDED
  - [x] Call executeTransact
  - [x] Return results
- [x] Write tests in server/src/execution/__tests__/transact.test.ts:
  - [x] atomic: true, first step fails → rollback, no changes
  - [x] atomic: true, all steps succeed → commit, all changes applied
  - [x] atomic: false, second step fails → first step committed, second fails
  - [x] Query step reads transaction state (read-your-writes)
  - [x] Mixed query+mutation steps work correctly
  - [x] Step limit exceeded returns LIMIT_EXCEEDED
  - [x] Guards work within transaction steps

## Verification Steps

### Automated Tests

```bash
# Run transact tests
npm test server/src/execution/__tests__/transact.test.ts

# Run integration tests
npm test server/src/routes/__tests__/transact.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Test atomic rollback
curl -X POST http://localhost:3000/datafn/transact \
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
curl -X POST http://localhost:3000/datafn/transact \
  -H "Content-Type: application/json" \
  -d '{
    "atomic": true,
    "steps": [
      {"mutation":{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-3","operation":"insert","record":{"title":"New Task","status":"pending"}}},
      {"query":{"resource":"tasks","version":"1","filters":{"status":"pending"}}}
    ]
  }'

# Expected: Query result includes the newly inserted task

# Test step limit
curl -X POST http://localhost:3000/datafn/transact \
  -H "Content-Type: application/json" \
  -d '{
    "atomic": true,
    "steps": [/* 101 steps */]
  }'

# Expected: {"ok":false,"error":{"code":"LIMIT_EXCEEDED","message":"Transaction exceeds maximum steps","details":{"path":"steps","max":100}}}
```

### Test Vectors Verification

Run test vectors:
- TV-TX-ATOMIC-ROLLBACK-001
- TV-TX-ATOMIC-PARTIAL-001
- TV-TX-QUERY-STEP-001
- TV-TX-QUERY-READYOURWRITES-001
- TV-TX-QUERY-MUTATION-MIX-001
- TV-TX-LIMIT-EXCEEDED-001
- TV-TX-LIMIT-OK-001

Expected: All 7 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms atomic rollback works
3. ✅ Test vectors TV-TX-* pass
4. ✅ Query steps can read uncommitted transaction state
5. ✅ Step limits enforced
6. ✅ No regressions in existing mutation/query tests

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_02 (error handling), PHASE_03 (guards), PHASE_05 (relation mutations)

**Blocks**: PHASE_12 (Python transact)
