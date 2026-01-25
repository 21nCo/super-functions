# PHASE_00: Fix Invalid JSON Ordering

## Phase Goal

Ensure authorization only runs on valid JSON by parsing request bodies before calling authorize(), returning DFQL_INVALID for invalid JSON instead of FORBIDDEN.

## In Scope

- Refactor server.ts withAuth middleware to parse JSON before authorize call
- Return deterministic DFQL_INVALID for invalid JSON on all POST endpoints
- Ensure authorize() receives parsed payload (not null) for valid JSON
- Ensure GET /datafn/status calls authorize with null payload (no body)

## Out of Scope

- Authorization logic changes (only ordering changes)
- Other validation beyond JSON parsing
- Client-side changes

## Deliverables

- `server/src/server.ts` - Refactored withAuth middleware
- `server/src/http/json.ts` - JSON parsing helper (if needed)
- `server/src/routes/__tests__/auth-ordering.test.ts` - New test file for auth ordering

## Requirements Covered

- **AUTH-001**: Invalid JSON ordering (P0)

## Implementation Tasks

- [ ] Review current withAuth middleware in server/src/server.ts
- [ ] Create parseJsonBody() helper in server/src/http/json.ts that:
  - [ ] Accepts raw request body
  - [ ] Attempts JSON.parse()
  - [ ] Returns { ok: true, data } on success
  - [ ] Returns { ok: false, error: DatafnError } on parse failure with code DFQL_INVALID
- [ ] Refactor withAuth middleware to:
  - [ ] Parse JSON first for POST/PUT/PATCH endpoints
  - [ ] Return errorResponse immediately if parsing fails
  - [ ] Call authorize(ctx, action, parsedPayload) only after successful parse
  - [ ] For GET /datafn/status, call authorize(ctx, action, null)
- [ ] Update all route handlers to expect parsed payload (not raw body)
- [ ] Write tests in server/src/routes/__tests__/auth-ordering.test.ts:
  - [ ] Test invalid JSON returns DFQL_INVALID (not FORBIDDEN)
  - [ ] Test valid JSON denied by auth returns FORBIDDEN
  - [ ] Test valid JSON authorized executes normally
  - [ ] Test GET /datafn/status with no body calls authorize correctly

## Verification Steps

### Automated Tests

```bash
# Run new auth ordering tests
npm test server/src/routes/__tests__/auth-ordering.test.ts

# Expected: All tests pass
# - Invalid JSON returns { ok: false, error: { code: "DFQL_INVALID", message: "Invalid JSON", details: { path: "$" } } }
# - Valid JSON denied returns { ok: false, error: { code: "FORBIDDEN", ... } }
# - Valid JSON authorized executes handler
```

### Manual Verification

```bash
# Start server with auth configured to deny all requests
npm run dev:server

# Test 1: Invalid JSON should return DFQL_INVALID
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{invalid json}'

# Expected: {"ok":false,"error":{"code":"DFQL_INVALID","message":"Invalid JSON","details":{"path":"$"}}}
# MUST NOT return: {"ok":false,"error":{"code":"FORBIDDEN",...}}

# Test 2: Valid JSON should return FORBIDDEN (when auth denies)
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","filters":{}}'

# Expected: {"ok":false,"error":{"code":"FORBIDDEN",...}}
```

### Test Vectors Verification

Run test vectors:
- TV-AUTH-INV-JSON-001 (valid JSON with auth)
- TV-AUTH-INV-JSON-002 (invalid JSON returns DFQL_INVALID)
- TV-AUTH-INV-JSON-003 (valid JSON denied by auth)

Expected: All 3 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms invalid JSON returns DFQL_INVALID
3. ✅ Test vectors TV-AUTH-INV-JSON-001/002/003 pass
4. ✅ No regressions in existing server tests
5. ✅ Code reviewed (if applicable)

**Estimated Duration**: 1 day

**Dependencies**: None (foundation phase)

**Blocks**: PHASE_01 (validation relies on parsed payloads)
