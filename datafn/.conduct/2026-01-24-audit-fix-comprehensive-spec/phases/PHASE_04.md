# PHASE_04: Replace Operation Semantics

## Phase Goal

Implement correct `replace` operation semantics that clear unspecified fields to defaults/null (not merge), and return NOT_FOUND for non-existent records.

## In Scope

- Replace operation that clears unspecified fields
- NOT_FOUND error for replace on non-existent record
- Preserve id, createdAt, createdBy system fields
- Update updatedAt, updatedBy system fields
- Required field validation for replace

## Out of Scope

- Merge operation changes (already correct)
- Insert operation changes
- Relation field handling (covered in PHASE_05)

## Deliverables

- `server/src/execution/mutation/dfql.ts` - Updated replace logic
- `server/src/execution/mutation/execute.ts` - Replace execution
- `server/src/execution/mutation/__tests__/replace.test.ts` - Replace tests

## Requirements Covered

- **MUT-REPLACE-001**: Replace operation semantics (P0)

## Implementation Tasks

- [x] Review current replace implementation in server/src/execution/mutation/dfql.ts
- [x] Update buildReplaceRecord function:
  - [x] Start with schema defaults for all fields
  - [x] Apply provided record fields
  - [x] Preserve system fields: id, createdAt, createdBy (from existing record)
  - [x] Update system fields: updatedAt (now), updatedBy (from context)
  - [x] Validate all required fields are present
  - [x] If required field missing, throw DFQL_INVALID error
- [x] Update server/src/execution/mutation/execute.ts replace case:
  - [x] Fetch existing record by id
  - [x] If not found, throw NOT_FOUND error (no upsert)
  - [x] Build replace record using buildReplaceRecord
  - [x] Execute adapter update with full replacement
  - [x] Return affectedIds
- [x] Distinguish from merge operation:
  - [x] Merge: applies partial updates, preserves unspecified fields
  - [x] Replace: applies full replacement, clears unspecified fields
- [x] Write tests in server/src/execution/mutation/__tests__/replace.test.ts:
  - [x] Replace with existing record clears unspecified fields
  - [x] Replace preserves id, createdAt, createdBy
  - [x] Replace updates updatedAt, updatedBy
  - [x] Replace on non-existent record returns NOT_FOUND
  - [x] Replace missing required field returns DFQL_INVALID
  - [x] Merge still works as partial update (no regression)

## Verification Steps

### Automated Tests

```bash
# Run replace tests
npm test server/src/execution/mutation/__tests__/replace.test.ts

# Run mutation tests
npm test server/src/routes/__tests__/mutation.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Setup: Create task-1 with multiple fields
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-setup","operation":"insert","record":{"id":"task-1","title":"Old Title","description":"Old Description","status":"active","priority":"high"}}'

# Test replace clears unspecified fields
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"replace","id":"task-1","record":{"title":"New Title"}}'

# Expected: {"ok":true,"result":{"ok":true,"mutationId":"mut-1","affectedIds":["task-1"]}}

# Verify task-1 now has:
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"id":"task-1"}}'

# Expected result should show:
# - title: "New Title" (updated)
# - description: null or default (cleared)
# - status: null or default (cleared)
# - priority: null or default (cleared)
# - id: "task-1" (preserved)
# - createdAt: <original> (preserved)

# Test replace on non-existent record
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-2","operation":"replace","id":"nonexistent","record":{"title":"Test"}}'

# Expected: {"ok":false,"error":{"code":"NOT_FOUND","message":"Record not found: nonexistent","details":{"path":"id"}}}

# Test merge still works (no regression)
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-3","operation":"merge","id":"task-1","record":{"status":"completed"}}'

# Verify: Only status changed, title preserved
```

### Test Vectors Verification

Run test vectors:
- TV-MUT-REPLACE-CLEAR-001
- TV-MUT-REPLACE-NOTFOUND-001
- TV-MUT-REPLACE-REQUIRED-001

Expected: All 3 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms replace clears unspecified fields
3. ✅ Test vectors TV-MUT-REPLACE-* pass
4. ✅ Replace returns NOT_FOUND for non-existent records
5. ✅ Merge operation still works correctly (no regression)
6. ✅ System fields preserved/updated correctly

**Estimated Duration**: 1-2 days

**Dependencies**: PHASE_01 (validation), PHASE_02 (error handling)

**Blocks**: None (independent from other mutation features)
