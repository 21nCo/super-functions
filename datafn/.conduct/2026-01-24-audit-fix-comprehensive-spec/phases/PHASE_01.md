# PHASE_01: Schema-Bounded Validation

## Phase Goal

Implement comprehensive schema-bounded validation for all DFQL endpoints, rejecting unknown resources, fields, and relations with deterministic errors before adapter execution.

## In Scope

- Validation helpers for resources, fields, relations
- Query validation (resource, select, filters, sort, omit, groupBy, aggregations, having)
- Mutation validation (resource, record fields, if guard fields, relations)
- Transact validation (all steps)
- Push validation (all mutations)
- Deterministic error responses with accurate details.path

## Out of Scope

- Field constraint validation (min/max, pattern, etc.) - deferred
- Authorization logic
- Execution logic changes

## Deliverables

- `server/src/validation/schema.ts` - Schema validation helpers
- `server/src/validation/query.ts` - Query validation
- `server/src/validation/mutation.ts` - Mutation validation
- `server/src/routes/query.ts` - Updated with comprehensive validation
- `server/src/routes/mutation.ts` - Updated with comprehensive validation
- `server/src/routes/transact.ts` - Updated with step validation
- `server/src/routes/sync.ts` - Updated push validation
- `server/src/validation/__tests__/validation.test.ts` - Validation tests

## Requirements Covered

- **VALID-001**: Schema-bounded validation for all endpoints (P0)

## Implementation Tasks

- [ ] Create server/src/validation/schema.ts with helpers:
  - [ ] `validateResource(schema, resourceName)` → returns DatafnError or null
  - [ ] `validateFields(schema, resourceName, fieldNames)` → returns DatafnError or null
  - [ ] `validateRelation(schema, resourceName, relationName)` → returns DatafnError or null
  - [ ] `getResource(schema, resourceName)` → returns resource or throws
  - [ ] `getField(resource, fieldName)` → returns field or throws
  - [ ] `getRelation(schema, resourceName, relationName)` → returns relation or throws
- [ ] Create server/src/validation/query.ts:
  - [ ] `validateQueryRequest(schema, query)` → validates all DFQL keys
  - [ ] Validate resource exists
  - [ ] Validate select fields/relations
  - [ ] Validate filter paths (fields, relations, nested)
  - [ ] Validate sort fields
  - [ ] Validate omit fields
  - [ ] Validate groupBy fields
  - [ ] Validate aggregation fields
  - [ ] Validate having fields
  - [ ] Return DatafnError with accurate details.path for each failure
- [ ] Create server/src/validation/mutation.ts:
  - [ ] `validateMutationRequest(schema, mutation)` → validates all mutation keys
  - [ ] Validate resource exists
  - [ ] Validate record fields
  - [ ] Validate if guard fields
  - [ ] Validate relations object keys
  - [ ] Validate relation metadata keys
  - [ ] Return DatafnError with accurate details.path
- [ ] Update server/src/routes/query.ts:
  - [ ] Call validateQueryRequest before execution
  - [ ] Return errorResponse immediately on validation failure
  - [ ] Remove duplicate validation logic
- [ ] Update server/src/routes/mutation.ts:
  - [ ] Call validateMutationRequest before execution
  - [ ] Return errorResponse immediately on validation failure
- [ ] Update server/src/routes/transact.ts:
  - [ ] Validate each step (query or mutation) before execution
  - [ ] Return errorResponse on first validation failure
- [ ] Update server/src/routes/sync.ts (push):
  - [ ] Validate each mutation in batch before applying
  - [ ] Return per-mutation validation errors in response
- [ ] Write comprehensive tests in server/src/validation/__tests__/validation.test.ts:
  - [ ] Test unknown resource
  - [ ] Test unknown field in select
  - [ ] Test unknown field in filters
  - [ ] Test unknown field in sort
  - [ ] Test unknown relation in select
  - [ ] Test unknown relation in filters
  - [ ] Test unknown field in mutation record
  - [ ] Test unknown relation in mutation
  - [ ] Test unknown metadata key in relation mutation

## Verification Steps

### Automated Tests

```bash
# Run validation tests
npm test server/src/validation/__tests__/validation.test.ts

# Run route tests
npm test server/src/routes/__tests__/

# Expected: All tests pass with deterministic error responses
```

### Manual Verification

```bash
# Start server
npm run dev:server

# Test unknown resource
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"unknown_table","version":"1","filters":{}}'

# Expected: {"ok":false,"error":{"code":"DFQL_UNKNOWN_RESOURCE","message":"Unknown resource: unknown_table","details":{"path":"resource"}}}

# Test unknown field
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","select":["title","unknown_field"]}'

# Expected: {"ok":false,"error":{"code":"DFQL_UNKNOWN_FIELD","message":"Unknown field: unknown_field","details":{"path":"select[1]"}}}

# Test unknown relation
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","select":["title","unknown_relation.*"]}'

# Expected: {"ok":false,"error":{"code":"DFQL_UNKNOWN_RELATION","message":"Unknown relation: unknown_relation","details":{"path":"select[1]"}}}
```

### Test Vectors Verification

Run test vectors:
- TV-VALID-RESOURCE-001
- TV-VALID-FIELD-001
- TV-VALID-RELATION-001
- TV-VALID-MUTATION-001
- TV-VALID-PUSH-001

Expected: All 5 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms deterministic validation errors
3. ✅ Test vectors TV-VALID-* pass
4. ✅ All endpoints validate before execution (no adapter errors for schema violations)
5. ✅ No regressions in existing tests

**Estimated Duration**: 2-3 days

**Dependencies**: PHASE_00 (requires parsed payloads)

**Blocks**: PHASE_02, PHASE_03, PHASE_05 (mutation/query validation required)
