# PHASE_03: Optimistic Concurrency Guards

## Phase Goal

Implement `if` guard enforcement on mutations by evaluating guard filters against current server record state before applying mutations, returning CONFLICT when guards don't match.

## In Scope

- Guard evaluation using existing filter semantics
- CONFLICT error response for guard mismatches
- Guard evaluation before mutation execution
- Guard on non-existent records (always fails)

## Out of Scope

- New filter operators (use existing filter evaluation)
- Transaction-level guards (covered in PHASE_06)
- Client-side optimistic updates

## Deliverables

- `server/src/execution/mutation/guards.ts` - Guard evaluation logic (new)
- `server/src/execution/mutation/execute.ts` - Updated to evaluate guards
- `server/src/routes/mutation.ts` - Updated to handle CONFLICT responses
- `server/src/execution/mutation/__tests__/guards.test.ts` - Guard tests

## Requirements Covered

- **MUT-GUARD-001**: Optimistic concurrency guards (P0)

## Implementation Tasks

- [x] Create server/src/execution/mutation/guards.ts:
  - [x] `evaluateGuard(adapter, resource, id, guardFilter)` → returns { match: boolean }
  - [x] Fetch current record from DB by id
  - [x] If record not found, return { match: false }
  - [x] Apply guardFilter using existing filter evaluation from query execution
  - [x] Return { match: true } if filter matches, { match: false } otherwise
- [x] Update server/src/execution/mutation/execute.ts:
  - [x] For merge/replace/delete operations with `if` guard:
    - [x] Call evaluateGuard before applying mutation
    - [x] If guard.match === false, throw error with code CONFLICT
    - [x] If guard.match === true, proceed with mutation
  - [x] For insert operations with `if` guard:
    - [x] Validate guard is not present (insert can't have guards on non-existent records)
    - [x] Or: evaluate guard against empty record (always fails)
- [x] Update server/src/routes/mutation.ts:
  - [x] Catch CONFLICT errors from execute
  - [x] Return errorResponse with:
    - [x] code: "CONFLICT"
    - [x] message: "Guard condition not met"
    - [x] details: { path: "if" }
- [x] Write tests in server/src/execution/mutation/__tests__/guards.test.ts:
  - [x] Guard match → mutation applied
  - [x] Guard mismatch → CONFLICT returned, mutation not applied
  - [x] Guard on non-existent record → CONFLICT returned
  - [x] Complex guards (nested filters) work correctly
  - [x] No guard → mutation applied normally

## Verification Steps

### Automated Tests

```bash
# Run guard tests
npm test server/src/execution/mutation/__tests__/guards.test.ts

# Run mutation tests
npm test server/src/routes/__tests__/mutation.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Setup: Create task-1 with status "active"
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-setup","operation":"insert","record":{"id":"task-1","title":"Test","status":"active"}}'

# Test guard match (should succeed)
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"merge","id":"task-1","record":{"status":"completed"},"if":{"status":"active"}}'

# Expected: {"ok":true,"result":{"ok":true,"mutationId":"mut-1","affectedIds":["task-1"]}}
# Verify: task-1.status is now "completed"

# Test guard mismatch (should fail)
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-2","operation":"merge","id":"task-1","record":{"status":"archived"},"if":{"status":"active"}}'

# Expected: {"ok":false,"error":{"code":"CONFLICT","message":"Guard condition not met","details":{"path":"if"}}}
# Verify: task-1.status is still "completed" (not changed)
```

### Test Vectors Verification

Run test vectors:
- TV-MUT-GUARD-PASS-001
- TV-MUT-GUARD-FAIL-001
- TV-MUT-GUARD-NOTFOUND-001

Expected: All 3 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms guard enforcement
3. ✅ Test vectors TV-MUT-GUARD-* pass
4. ✅ Guard match allows mutation
5. ✅ Guard mismatch returns CONFLICT without applying mutation
6. ✅ No regressions in existing mutation tests

**Estimated Duration**: 2 days

**Dependencies**: PHASE_01 (validation), PHASE_02 (error handling)

**Blocks**: PHASE_06 (transact mutations with guards)
