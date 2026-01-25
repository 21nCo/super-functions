# PHASE_07: Cursor Pagination

## Phase Goal

Implement cursor pagination with nextCursor emission when more pages exist, backwards pagination via cursor.before, and cursor sort validation requiring id tie-breaker.

## In Scope

- nextCursor emission (null when no more pages)
- nextCursor value computation from last result row
- cursor.before backwards pagination
- Cursor sort validation (id as final key)
- Deterministic cursor pagination

## Out of Scope

- Offset pagination changes (already works)
- Aggregate query pagination (covered in PHASE_15)
- Client-side cursor handling

## Deliverables

- `server/src/execution/query/pagination.ts` - Updated cursor logic
- `server/src/execution/query/execute.ts` - nextCursor emission
- `server/src/routes/query.ts` - Cursor sort validation
- `server/src/execution/query/__tests__/pagination.test.ts` - Pagination tests

## Requirements Covered

- **PAGE-001**: nextCursor emission (P1)
- **PAGE-002**: Cursor backwards pagination (P1)
- **DETERM-003**: Cursor sort validation (P0)

## Implementation Tasks

- [x] Update server/src/routes/query.ts validation:
  - [x] Add `validateCursorSort(query)`:
    - [x] If cursor.after or cursor.before present:
      - [x] If sort missing: default to ["id:asc"]
      - [x] If sort present: validate id is final key
      - [x] If id missing from sort: return DFQL_INVALID error
    - [x] Return validation result
  - [x] Call validateCursorSort before execution
- [x] Update server/src/execution/query/pagination.ts:
  - [x] `computeNextCursor(results, sort, limit)`:
    - [x] If results.length < limit: return null (no more pages)
    - [x] If results.length === limit:
      - [x] Query one extra row to check if more exist
      - [x] If extra row exists: compute cursor from last result row
      - [x] Extract sort key values from last row
      - [x] Return { [sortKey]: value, ... } including id
    - [x] Else: return null
  - [x] `applyCursorBefore(query, cursor)`:
    - [x] Reverse sort directions (asc→desc, desc→asc)
    - [x] Apply cursor.before as upper bound (exclusive)
    - [x] Execute query with reversed sort
    - [x] Reverse result rows to restore original order
    - [x] Return results
- [x] Update server/src/execution/query/execute.ts:
  - [x] After fetching results, call computeNextCursor
  - [x] Include nextCursor in query result
  - [x] Handle cursor.before by calling applyCursorBefore
- [x] Write tests in server/src/execution/query/__tests__/pagination.test.ts:
  - [x] nextCursor present when more pages exist
  - [x] nextCursor null when no more pages
  - [x] nextCursor contains correct sort key values
  - [x] cursor.before backwards pagination works
  - [x] cursor.before at edges returns empty results
  - [x] Cursor without id in sort returns DFQL_INVALID
  - [x] Cursor without sort defaults to id:asc

## Verification Steps

### Automated Tests

```bash
# Run pagination tests
npm test server/src/execution/query/__tests__/pagination.test.ts

# Run query tests
npm test server/src/routes/__tests__/query.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Setup: Create 15 tasks
for i in {1..15}; do
  curl -X POST http://localhost:3000/datafn/mutation \
    -H "Content-Type: application/json" \
    -d "{\"resource\":\"tasks\",\"version\":\"1\",\"clientId\":\"client-1\",\"mutationId\":\"mut-$i\",\"operation\":\"insert\",\"record\":{\"title\":\"Task $i\"}}"
done

# Test nextCursor present
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","sort":["id:asc"],"limit":10}'

# Expected: {"ok":true,"result":{"data":[/* 10 tasks */],"nextCursor":{"id":"<id-of-10th-task>"}}}

# Test nextCursor null
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","sort":["id:asc"],"limit":20}'

# Expected: {"ok":true,"result":{"data":[/* 15 tasks */],"nextCursor":null}}

# Test cursor.before backwards pagination
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","sort":["id:asc"],"cursor":{"before":{"id":"<id-of-11th-task>"}},"limit":10}'

# Expected: Returns tasks 1-10 in original order

# Test cursor without id in sort fails
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","sort":["createdAt:asc"],"cursor":{"after":{"createdAt":"2026-01-01T00:00:00Z"}}}'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID","message":"Cursor pagination requires id as final sort key","details":{"path":"sort"}}}
```

### Test Vectors Verification

Run test vectors:
- TV-PAGE-NEXTCURSOR-PRESENT-001
- TV-PAGE-NEXTCURSOR-NULL-001
- TV-PAGE-NEXTCURSOR-VALUES-001
- TV-PAGE-BEFORE-001
- TV-PAGE-BEFORE-EDGES-001
- TV-CURSOR-SORT-VALID-001
- TV-CURSOR-SORT-INVALID-001
- TV-CURSOR-SORT-DEFAULT-001

Expected: All 8 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms nextCursor emission
3. ✅ Test vectors TV-PAGE-* and TV-CURSOR-* pass
4. ✅ Backwards pagination works correctly
5. ✅ Cursor sort validation enforced
6. ✅ No regressions in existing query tests

**Estimated Duration**: 2-3 days

**Dependencies**: PHASE_02 (error handling for validation)

**Blocks**: None (independent feature)
