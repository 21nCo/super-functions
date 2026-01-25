# PHASE_15: Completeness - Filters, Aggregations, Limits, Observability

## Phase Goal

Implement remaining P2 completeness features: nested object filters, additional filter operators, aggregate ordering/pagination, limits enforcement, observability (log redaction), sync robustness, and determinism cleanup.

## In Scope

- Nested object dot-path traversal in filters
- Additional filter operators (in, not_in, between, is_empty, etc.)
- Aggregate query ordering and pagination
- maxPayloadBytes enforcement
- Query/relation depth limits
- Sensitive field redaction in logs
- Request metadata logging
- serverSeq atomicity verification
- Clone ordering determinism verification
- Remote-only table enforcement in client
- Determinism cleanup (Date.now, Math.random removal)

## Out of Scope

- New major features (all P0/P1 covered)
- Cascade semantics (explicitly deferred)
- Field-level encryption enforcement (deferred)

## Deliverables

- `server/src/execution/query/filters.ts` - Nested object + new operators
- `server/src/execution/query/aggregate.ts` - Ordering + pagination
- `server/src/http/middleware.ts` - Payload size limit (new)
- `server/src/validation/depth.ts` - Depth limits (new)
- `server/src/logging.ts` - Log redaction + metadata (new)
- `server/src/routes/seed.ts` - Remove Date.now()
- `client/src/extension/transport.ts` - Remove Math.random()
- `client/src/query.ts` - Remote-only enforcement
- `server/src/execution/__tests__/completeness.test.ts` - Completeness tests

## Requirements Covered

- **FILTER-001**: Nested object dot-path traversal (P2)
- **FILTER-002**: Additional filter operators (P2)
- **AGG-001**: Aggregate query ordering (P2)
- **AGG-002**: Aggregate pagination determinism (P2)
- **LIMIT-001**: maxPayloadBytes enforcement (P2)
- **LIMIT-002**: Query depth limits (P2)
- **LIMIT-003**: Relation expansion depth limits (P2)
- **OBS-001**: Sensitive field redaction (P2)
- **OBS-002**: Request metadata logging (P2)
- **SYNC-001**: serverSeq atomicity (P2)
- **SYNC-002**: Clone ordering determinism (P2)
- **SYNC-003**: Remote-only table enforcement (P2)
- **DETERM-001**: Remove Date.now() (P0 - cleanup)
- **DETERM-002**: Remove Math.random() (P0 - cleanup)

## Implementation Tasks

### Filters

- [ ] Update server/src/execution/query/filters.ts:
  - [ ] Add nested object dot-path support:
    - [ ] Detect if path crosses object field (not relation)
    - [ ] Traverse nested object properties
    - [ ] Handle missing intermediate objects (null)
  - [ ] Add new operators:
    - [ ] `in`: value in array
    - [ ] `not_in`: value not in array
    - [ ] `not_like` / `not_ilike`: negated LIKE
    - [ ] `between` / `not_between`: range checks
    - [ ] `is_empty` / `is_not_empty`: empty string/array/object checks
  - [ ] Write tests for nested objects and new operators

### Aggregations

- [ ] Update server/src/execution/query/aggregate.ts:
  - [ ] Add `orderGroupedResults(groups, sort)`:
    - [ ] Sort groups by group key fields if no sort
    - [ ] Sort by sort keys (including aggregation aliases)
    - [ ] Apply deterministic tie-breaker
  - [ ] Add `paginateGroupedResults(groups, limit, offset, cursor)`:
    - [ ] Apply offset/limit
    - [ ] Compute nextCursor from last group
    - [ ] Return paginated groups + cursor
  - [ ] Integrate ordering + pagination into aggregate execution
  - [ ] Write tests for aggregate ordering and pagination

### Limits

- [ ] Create server/src/http/middleware.ts:
  - [ ] Add `enforcePayloadLimit(maxBytes)` middleware:
    - [ ] Check Content-Length header
    - [ ] If > maxBytes: return LIMIT_EXCEEDED before parsing
    - [ ] Apply to all POST routes
- [ ] Create server/src/validation/depth.ts:
  - [ ] Add `validateFilterDepth(filter, maxDepth)`:
    - [ ] Recursively count nesting depth
    - [ ] If > maxDepth: return DFQL_INVALID / LIMIT_EXCEEDED
  - [ ] Add `validateRelationDepth(selectToken, maxDepth)`:
    - [ ] Count nesting depth in relation tokens
    - [ ] If > maxDepth: return LIMIT_EXCEEDED
  - [ ] Default maxDepth: filters=10, relations=5
- [ ] Integrate depth validation in query route
- [ ] Write tests for limits

### Observability

- [ ] Create server/src/logging.ts:
  - [ ] Add `redactSensitiveFields(record, schema)`:
    - [ ] Find fields with encrypt:true
    - [ ] Replace values with "[REDACTED]"
    - [ ] Return redacted record
  - [ ] Add `logRequest(metadata)`:
    - [ ] Log: timestamp, endpoint, clientId, mutationId, resource, operation, duration_ms
    - [ ] Use structured format (JSON)
    - [ ] Redact sensitive fields
  - [ ] Export logging helpers
- [ ] Update route handlers to call logRequest
- [ ] Write tests for redaction

### Determinism Cleanup

- [ ] Update server/src/routes/seed.ts:
  - [ ] Remove `Date.now()` / `new Date()` from seed record
  - [ ] Use client-provided timestamp or omit timestamp
  - [ ] Ensure deterministic seed behavior
- [ ] Update client/src/extension/transport.ts:
  - [ ] Replace `Math.random()` with counter-based ID
    ```typescript
    let requestIdCounter = 0;
    function generateRequestId() {
      return ++requestIdCounter;
    }
    ```
  - [ ] Use counter for all RPC request IDs
- [ ] Write tests for deterministic IDs

### Sync Robustness

- [ ] Verify server/src/execution/sync/change-tracking.ts:
  - [ ] serverSeq increment is atomic (CAS or DB-level atomic)
  - [ ] Add integration test with concurrent mutations
- [ ] Verify server/src/execution/sync/clone.ts:
  - [ ] Records ordered by id:asc deterministically
  - [ ] Add test for deterministic ordering
- [ ] Update client/src/query.ts:
  - [ ] Check if table has isRemoteOnly flag
  - [ ] If remote-only: always route to remote (never local)
  - [ ] Add test for remote-only routing

## Verification Steps

### Automated Tests

```bash
# Run completeness tests
npm test server/src/execution/__tests__/completeness.test.ts

# Run all tests
npm test

# Expected: All tests pass
```

### Manual Verification - Filters

```bash
# Test nested object filter
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"metadata.priority":"high"}}'

# Expected: Returns tasks with metadata.priority === "high"

# Test new operators
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"status":{"in":["active","pending"]}}}'

# Expected: Returns tasks with status in ["active", "pending"]
```

### Manual Verification - Limits

```bash
# Test payload limit
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{/* 11MB payload */}'

# Expected: {"ok":false,"error":{"code":"LIMIT_EXCEEDED","message":"Request payload exceeds maximum size",...}}

# Test filter depth limit
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"$and":[{"$or":[{"$and":[/* ... 11 levels */]}]}]}}'

# Expected: {"ok":false,"error":{"code":"LIMIT_EXCEEDED","message":"Filter nesting depth exceeds limit",...}}
```

### Manual Verification - Observability

```bash
# Check server logs after mutation
# Look for:
# - Timestamp
# - Endpoint
# - Resource
# - Operation
# - Duration_ms
# - No plaintext sensitive field values (redacted)

# Example log entry:
# {"timestamp":"2026-01-24T12:00:00Z","endpoint":"/datafn/mutation","resource":"users","operation":"insert","duration_ms":45,"record":{"email":"user@example.com","password":"[REDACTED]"}}
```

### Test Vectors Verification

Run all remaining test vectors:
- TV-FILTER-NESTED-OBJ-001
- TV-FILTER-OPS-IN-001, TV-FILTER-OPS-BETWEEN-001, TV-FILTER-OPS-EMPTY-001
- TV-AGG-ORDER-001, TV-AGG-SORT-ALIAS-001
- TV-AGG-PAGE-001, TV-AGG-CURSOR-001
- TV-LIMIT-PAYLOAD-001, TV-LIMIT-DEPTH-FILTER-001, TV-LIMIT-REL-DEPTH-001
- TV-OBS-REDACT-001, TV-OBS-LOG-001
- TV-SYNC-SERVERSEQ-CONCURRENT-001, TV-SYNC-CLONE-ORDER-001, TV-SYNC-REMOTE-ONLY-001
- TV-DETERM-SEED-001, TV-DETERM-CURSOR-001, TV-DETERM-RPC-ID-001

Expected: All vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms all P2 features work
3. ✅ All test vectors (P0/P1/P2) pass
4. ✅ No Date.now() or Math.random() in execution paths
5. ✅ Sensitive fields redacted in logs
6. ✅ All limits enforced
7. ✅ No regressions in any tests

**Estimated Duration**: 3-5 days

**Dependencies**: All prior phases (polishing/completeness phase)

**Blocks**: None (final phase)

---

## Phase 15 Completion = Spec Completion

Upon completing Phase 15:
- ✅ All 80+ requirements implemented
- ✅ All 100+ test vectors pass
- ✅ All 59 intent items status: PASS
- ✅ All 10 audit recommendations addressed
- ✅ All 5 spec conflicts resolved
- ✅ All 3 spec gaps closed
- ✅ Documentation 100% accurate
- ✅ Python-TypeScript parity verified

**Ready for production deployment.**
