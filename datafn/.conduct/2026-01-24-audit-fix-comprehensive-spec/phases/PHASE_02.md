# PHASE_02: Execution Error Surfacing

## Phase Goal

Ensure query and mutation execution errors surface as deterministic top-level envelopes instead of being swallowed as empty results or INTERNAL errors.

## In Scope

- Remove broad catch blocks that return empty results
- Classify execution errors deterministically (DFQL_INVALID, DFQL_UNKNOWN_*, INTERNAL)
- Return proper error envelopes for all execution failures
- Preserve valid empty result handling (zero matches returns ok:true with data:[])

## Out of Scope

- Validation logic (covered in PHASE_01)
- Authorization changes
- Adapter error handling improvements (beyond classification)

## Deliverables

- `server/src/routes/query.ts` - Remove error swallowing, proper error responses
- `server/src/routes/mutation.ts` - Proper mutation error handling
- `server/src/execution/query/execute.ts` - Error classification
- `server/src/execution/mutation/execute.ts` - Error classification
- `server/src/execution/errors.ts` - Error classification helper (new)
- `server/src/routes/__tests__/execution-errors.test.ts` - Execution error tests

## Requirements Covered

- **EXEC-001**: Query execution error surfacing (P0)
- **EXEC-002**: Mutation execution error surfacing (P0)

## Implementation Tasks

- [ ] Create server/src/execution/errors.ts:
  - [ ] `classifyExecutionError(error)` → returns DatafnError
  - [ ] Classify filter operator errors → DFQL_INVALID
  - [ ] Classify cursor validation errors → DFQL_INVALID
  - [ ] Classify sort field errors → DFQL_UNKNOWN_FIELD
  - [ ] Classify adapter errors → INTERNAL
  - [ ] Preserve validation errors (DFQL_UNKNOWN_*) as-is
- [ ] Update server/src/routes/query.ts:
  - [ ] Remove try-catch that returns { data: [], nextCursor: null }
  - [ ] Use classifyExecutionError for caught errors
  - [ ] Return errorResponse(classifiedError) instead of empty results
  - [ ] Preserve: valid queries with zero matches still return ok:true with data:[]
- [ ] Update server/src/execution/query/execute.ts:
  - [ ] Let validation errors bubble up (don't catch)
  - [ ] Catch only adapter/runtime errors
  - [ ] Use classifyExecutionError before re-throwing
- [ ] Update server/src/routes/mutation.ts:
  - [ ] Remove broad try-catch blocks
  - [ ] Classify mutation errors deterministically
  - [ ] Return errorResponse for top-level failures
  - [ ] Preserve: constraint violations → INTERNAL with details
  - [ ] Preserve: not found → NOT_FOUND
  - [ ] Preserve: guard mismatch → CONFLICT
- [ ] Update server/src/execution/mutation/execute.ts:
  - [ ] Classify adapter constraint violations → INTERNAL
  - [ ] Classify record not found → NOT_FOUND
  - [ ] Let validation errors bubble
- [ ] Write tests in server/src/routes/__tests__/execution-errors.test.ts:
  - [ ] Invalid filter operator returns DFQL_INVALID (not empty results)
  - [ ] Invalid cursor values return DFQL_INVALID (not empty results)
  - [ ] Invalid sort field returns DFQL_UNKNOWN_FIELD (not empty results)
  - [ ] Adapter errors return INTERNAL (not empty results)
  - [ ] Valid query with zero results returns ok:true, data:[]
  - [ ] Mutation constraint violation returns INTERNAL
  - [ ] Mutation not found returns NOT_FOUND

## Verification Steps

### Automated Tests

```bash
# Run execution error tests
npm test server/src/routes/__tests__/execution-errors.test.ts

# Run full test suite
npm test

# Expected: All tests pass, no empty results for errors
```

### Manual Verification

```bash
# Start server
npm run dev:server

# Test invalid filter operator (should NOT return empty results)
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"status":{"unknown_op":"value"}}}'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID","message":"Unknown filter operator: unknown_op",...}}
# MUST NOT: {"ok":true,"result":{"data":[],"nextCursor":null}}

# Test invalid cursor value
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","sort":["createdAt:asc","id:asc"],"cursor":{"after":{"createdAt":"bad-date","id":"task-1"}}}'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID","message":"Invalid cursor value for field: createdAt",...}}

# Test valid query with zero results (should return ok:true)
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"status":"nonexistent_status"}}'

# Expected: {"ok":true,"result":{"data":[],"nextCursor":null}}
```

### Test Vectors Verification

Run test vectors:
- TV-EXEC-QUERY-ERR-001 (invalid operator)
- TV-EXEC-QUERY-ERR-002 (invalid cursor)
- TV-EXEC-QUERY-ERR-003 (invalid sort field)
- TV-EXEC-QUERY-EMPTY-001 (valid empty result)
- TV-EXEC-MUT-ERR-002 (constraint violation)
- TV-EXEC-MUT-ERR-003 (guard mismatch)
- TV-EXEC-MUT-NOTFOUND-001 (not found)

Expected: All 7 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms errors surface (not swallowed)
3. ✅ Test vectors TV-EXEC-* pass
4. ✅ Valid empty results still return ok:true
5. ✅ No regressions in existing tests

**Estimated Duration**: 2 days

**Dependencies**: PHASE_01 (validation errors must be established first)

**Blocks**: PHASE_03, PHASE_04, PHASE_05, PHASE_06 (mutation/transact error handling)
