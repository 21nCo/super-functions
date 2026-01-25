# PHASE_05: Relation Mutations

## Phase Goal

Implement relation mutation operations (relate, modifyRelation, unrelate) for establishing, updating, and removing relations including many-many join rows with metadata.

## In Scope

- relate operation (all relation types)
- modifyRelation operation (many-many metadata updates)
- unrelate operation (all relation types)
- Join row creation/update/deletion for many-many relations
- Relation metadata validation
- Relation shorthand forms (string, string[], object)

## Out of Scope

- Cascade on unrelate (deferred)
- Complex relation filters in mutations (deferred)
- Relation operations in transactions (covered in PHASE_06)

## Deliverables

- `server/src/execution/mutation/relations.ts` - Relation mutation logic (new)
- `server/src/execution/mutation/execute.ts` - Integrate relation operations
- `server/src/validation/mutation.ts` - Relation payload validation
- `server/src/execution/mutation/__tests__/relations.test.ts` - Relation tests

## Requirements Covered

- **MUT-REL-001**: Relation mutations (relate/modifyRelation/unrelate) (P0)
- **MUT-REL-002**: Relation mutation payload validation (P0)

## Implementation Tasks

- [x] Create server/src/execution/mutation/relations.ts:
  - [x] `executeRelate(adapter, schema, mutation)`:
    - [x] For many-one: update FK on source record
    - [x] For one-many: update FK on target record(s)
    - [x] For many-many: create join row(s) with metadata
    - [x] For htree: update parentPath on target record
    - [x] Validate related records exist (NOT_FOUND if missing)
    - [x] Return affectedIds
  - [x] `executeModifyRelation(adapter, schema, mutation)`:
    - [x] For many-many only (others not applicable)
    - [x] Update join row metadata
    - [x] Validate join row exists
    - [x] Return affectedIds
  - [x] `executeUnrelate(adapter, schema, mutation)`:
    - [x] For many-one: clear FK on source record
    - [x] For one-many: clear FK on target record(s)
    - [x] For many-many: delete join row(s)
    - [x] For htree: clear parentPath on target record
    - [x] Return affectedIds
  - [x] Helper: `normalizeRelationPayload(payload)`:
    - [x] String → { $ref: string }
    - [x] String[] → [{ $ref: string }, ...]
    - [x] Object → validated object with $ref + metadata
- [x] Update server/src/validation/mutation.ts:
  - [x] Add `validateRelationPayload(schema, resourceName, relationName, payload)`:
    - [x] Validate relation exists in schema
    - [x] Validate $ref is string
    - [x] Validate metadata keys exist in relation schema
    - [x] Return DFQL_UNKNOWN_RELATION for unknown relations
    - [x] Return DFQL_UNKNOWN_FIELD for unknown metadata keys
- [x] Update server/src/execution/mutation/execute.ts:
  - [x] Add cases for relate, modifyRelation, unrelate operations
  - [x] Call corresponding functions from relations.ts
  - [x] Handle NOT_FOUND errors for missing related records
  - [x] Return mutation results
- [x] Write tests in server/src/execution/mutation/__tests__/relations.test.ts:
  - [x] relate: many-one (update FK)
  - [x] relate: many-many with metadata (create join row)
  - [x] modifyRelation: update many-many metadata
  - [x] unrelate: remove relation (delete join row or clear FK)
  - [x] relate with non-existent target returns NOT_FOUND
  - [x] Validation: unknown relation returns DFQL_UNKNOWN_RELATION
  - [x] Validation: unknown metadata key returns DFQL_UNKNOWN_FIELD

## Verification Steps

### Automated Tests

```bash
# Run relation tests
npm test server/src/execution/mutation/__tests__/relations.test.ts

# Run validation tests
npm test server/src/validation/__tests__/mutation.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Setup: Create task-1 and project-1
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-s1","operation":"insert","record":{"id":"task-1","title":"Task"}}'

curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"projects","version":"1","clientId":"client-1","mutationId":"mut-s2","operation":"insert","record":{"id":"project-1","name":"Project"}}'

# Test relate (many-one)
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"relate","id":"task-1","relations":{"project":"project-1"}}'

# Expected: {"ok":true,"result":{"ok":true,"mutationId":"mut-1","affectedIds":["task-1"]}}

# Verify task-1.projectId = "project-1"
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{"id":"task-1"},"select":["id","title","project"]}'

# Expected: task-1 has project: "project-1" (or expanded if project.* used)

# Test relate many-many with metadata
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-2","operation":"relate","id":"task-1","relations":{"tags":[{"$ref":"tag-1","order":0}]}}'

# Verify join row created

# Test unrelate
curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-3","operation":"unrelate","id":"task-1","relations":{"tags":"tag-1"}}'

# Verify join row deleted
```

### Test Vectors Verification

Run test vectors:
- TV-MUT-RELATE-001
- TV-MUT-RELATE-METADATA-001
- TV-MUT-MODIFY-REL-001
- TV-MUT-UNRELATE-001
- TV-MUT-REL-VALID-001
- TV-MUT-REL-INVALID-RELATION-001
- TV-MUT-REL-INVALID-METADATA-001

Expected: All 7 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms relation operations work
3. ✅ Test vectors TV-MUT-REL-* and TV-MUT-RELATE-* pass
4. ✅ All relation types supported (many-one, one-many, many-many)
5. ✅ Metadata validation works correctly
6. ✅ No regressions in existing mutation tests

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_01 (validation), PHASE_02 (error handling)

**Blocks**: PHASE_06 (transact with relation mutations), PHASE_09 (offline relation mutations)
