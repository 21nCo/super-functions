# PHASE_13: Python Sync Endpoints

## Phase Goal

Implement Python server sync endpoints (seed, clone, pull, push) with idempotency, serverSeq ordering, change tracking, and cursor semantics matching TypeScript server.

## In Scope

- POST /datafn/seed endpoint (Python)
- POST /datafn/clone endpoint (Python)
- POST /datafn/pull endpoint (Python)
- POST /datafn/push endpoint (Python)
- Change tracking table (__datafn_changes)
- Seed tracking table (__datafn_seed)
- serverSeq monotonic ordering
- Cursor derivation from serverSeq

## Out of Scope

- Client-side sync logic (already implemented)
- Multi-region sync
- Conflict resolution strategies beyond LWW

## Deliverables

- `python/datafn/handlers/sync.py` - Sync endpoints
- `python/datafn/change_tracking.py` - Change tracking logic
- `python/datafn/server.py` - Add sync routes
- `python/tests/test_sync.py` - Sync tests

## Requirements Covered

- **PY-004**: Python sync endpoints implementation (P1)

## Implementation Tasks

### Change Tracking

- [ ] Create python/datafn/change_tracking.py:
  - [ ] `get_next_server_seq(db, namespace)`:
    - [ ] Atomic increment of serverSeq counter
    - [ ] Use DB-level atomic increment or CAS retry
    - [ ] Return new serverSeq value
  - [ ] `write_change(db, namespace, table, operation, record_id, server_seq)`:
    - [ ] Insert into __datafn_changes table
    - [ ] Columns: namespace, table, operation, recordId, serverSeq, timestamp
    - [ ] Index on (namespace, table, serverSeq)
  - [ ] `get_changes_since(db, namespace, table, cursor)`:
    - [ ] Parse cursor as serverSeq integer
    - [ ] Query __datafn_changes WHERE serverSeq > cursor
    - [ ] Order by serverSeq ASC
    - [ ] Return changes + new cursor (max serverSeq)
  - [ ] `get_latest_cursor(db, namespace, table)`:
    - [ ] Query max(serverSeq) from __datafn_changes for table
    - [ ] Return as string cursor

### Seed Endpoint

- [ ] Create `handle_seed(request, config)`:
  - [ ] Parse JSON body
  - [ ] Validate clientId present
  - [ ] Call authorize(ctx, "seed", payload)
  - [ ] If denied: return FORBIDDEN
  - [ ] Check __datafn_seed table for (namespace, clientId)
  - [ ] If exists: return ok (idempotent)
  - [ ] If not exists: insert seed record
  - [ ] Return ok_response({"ok": True})

### Clone Endpoint

- [ ] Create `handle_clone(request, config)`:
  - [ ] Parse JSON body
  - [ ] Validate clientId and tables
  - [ ] Call authorize(ctx, "clone", payload)
  - [ ] If denied: return FORBIDDEN
  - [ ] For each requested table:
    - [ ] Check isRemoteOnly flag
    - [ ] If remote-only: return DFQL_INVALID
    - [ ] Query all records ordered by id ASC
    - [ ] Get latest cursor for table
  - [ ] Return ok_response({"data": {...}, "cursors": {...}})

### Pull Endpoint

- [ ] Create `handle_pull(request, config)`:
  - [ ] Parse JSON body
  - [ ] Validate clientId and cursors
  - [ ] Call authorize(ctx, "pull", payload)
  - [ ] If denied: return FORBIDDEN
  - [ ] For each table:
    - [ ] Get changes since cursor
    - [ ] Separate into records (upsert) and deleted (delete ops)
    - [ ] Get new cursor
  - [ ] Return ok_response({"records": {...}, "deleted": {...}, "cursors": {...}})

### Push Endpoint

- [ ] Create `handle_push(request, config)`:
  - [ ] Parse JSON body
  - [ ] Validate clientId and mutations
  - [ ] Call authorize(ctx, "push", payload)
  - [ ] If denied: return FORBIDDEN
  - [ ] For each mutation:
    - [ ] Validate mutation.clientId matches request.clientId
    - [ ] Check idempotency
    - [ ] If replayed: add to applied list
    - [ ] If not replayed:
      - [ ] Validate mutation against schema
      - [ ] Execute mutation
      - [ ] Get next serverSeq
      - [ ] Write change tracking entry
      - [ ] Store idempotency result
      - [ ] Add to applied list or errors list
  - [ ] Return ok_response({"applied": [...], "errors": [...]})

### Server Integration

- [ ] Update python/datafn/server.py:
  - [ ] Add POST /datafn/seed → handle_seed
  - [ ] Add POST /datafn/clone → handle_clone
  - [ ] Add POST /datafn/pull → handle_pull
  - [ ] Add POST /datafn/push → handle_push

### Tests

- [ ] Write python/tests/test_sync.py:
  - [ ] Seed idempotency (repeated seed returns ok)
  - [ ] Clone returns full snapshot + cursors
  - [ ] Clone rejects remote-only tables
  - [ ] Pull returns incremental changes
  - [ ] Pull advances cursors monotonically
  - [ ] Push applies mutations idempotently
  - [ ] Push validates clientId consistency
  - [ ] Push writes change tracking

## Verification Steps

### Automated Tests

```bash
# Run Python sync tests
cd python
python -m pytest tests/test_sync.py

# Expected: All tests pass
```

### Manual Verification

```bash
# Test seed
curl -X POST http://localhost:8000/datafn/seed \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client-1"}'

# Expected: {"ok":true,"result":{"ok":true}}

# Test clone
curl -X POST http://localhost:8000/datafn/clone \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client-1","tables":["tasks"]}'

# Expected: {"ok":true,"result":{"data":{"tasks":[...]},"cursors":{"tasks":"123"}}}

# Test pull
curl -X POST http://localhost:8000/datafn/pull \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client-1","cursors":{"tasks":"100"}}'

# Expected: {"ok":true,"result":{"records":{"tasks":[...]},"deleted":{"tasks":[...]},"cursors":{"tasks":"150"}}}

# Test push
curl -X POST http://localhost:8000/datafn/push \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client-1","mutations":[{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"insert","record":{"title":"Task"}}]}'

# Expected: {"ok":true,"result":{"applied":["mut-1"],"errors":[]}}
```

### Test Vectors Verification

Run test vectors:
- TV-PY-SEED-001
- TV-PY-CLONE-001
- TV-PY-PULL-001
- TV-PY-PUSH-001

Expected: All 4 vectors pass

### Contract Tests (Python vs TypeScript)

```bash
# Run parity tests comparing Python vs TS sync
python -m pytest tests/test_parity.py::test_sync_parity

# Expected: Python and TypeScript return identical responses for same inputs
```

## Stop Condition

Report completion when:
1. ✅ All Python sync tests pass
2. ✅ Manual verification confirms sync endpoints work
3. ✅ Test vectors TV-PY-SEED/CLONE/PULL/PUSH pass
4. ✅ Change tracking persists across requests
5. ✅ serverSeq ordering is monotonic
6. ✅ Parity tests confirm Python matches TypeScript

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_11 (Python mutation/validation), PHASE_12 (Python transact patterns)

**Blocks**: None (completes Python server parity)
