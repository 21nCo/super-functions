# PHASE_08: Storage Adapter Validation

## Phase Goal

Implement deterministic input validation in storage adapters (memory and IndexedDB) to reject invalid hydration states, cursor formats, and changelog entries.

## In Scope

- Hydration state validation (only notStarted/hydrating/ready allowed)
- Hydration state transition validation (no invalid transitions)
- Cursor format validation (string or null only)
- Changelog entry validation (clientId and mutationId required)
- Table name validation against schema
- Deterministic error messages

## Out of Scope

- Storage adapter performance improvements
- New storage adapter implementations
- Client offline query changes (covered in PHASE_09)

## Deliverables

- `client/src/adapters/memoryStorage.ts` - Updated with validation
- `client/src/adapters/indexedDbStorage.ts` - Updated with validation
- `client/src/adapters/__tests__/storage-validation.test.ts` - Validation tests

## Requirements Covered

- **STORAGE-001**: Storage adapter input validation (P1)
- **STORAGE-002**: Memory adapter deterministic rejection (P1)
- **STORAGE-003**: IndexedDB adapter deterministic rejection (P1)

## Implementation Tasks

- [x] Update client/src/adapters/memoryStorage.ts:
  - [x] Add validation helper `validateHydrationState(state)`:
    - [x] If state not in ["notStarted", "hydrating", "ready"]: throw error "Invalid hydration state"
    - [x] Return state
  - [x] Add validation helper `validateTransition(fromState, toState)`:
    - [x] Valid transitions: notStarted→hydrating, hydrating→ready, ready→hydrating (re-sync)
    - [x] Invalid: ready→notStarted, hydrating→notStarted
    - [x] If invalid: throw error "Invalid hydration state transition"
  - [x] Update `setHydrationState(table, state)`:
    - [x] Call validateHydrationState(state)
    - [x] Get current state
    - [x] Call validateTransition(currentState, state)
    - [x] Apply state change
  - [x] Update `setCursor(table, cursor)`:
    - [x] If cursor not null and typeof cursor !== "string": throw error "Invalid cursor format"
    - [x] Apply cursor
  - [x] Update `appendToChangelog(mutation)`:
    - [x] If !mutation.clientId: throw error "Missing clientId in mutation"
    - [x] If !mutation.mutationId: throw error "Missing mutationId in mutation"
    - [x] Append to changelog
  - [x] Add `validateTableName(table)`:
    - [x] If table not in schema resources: throw error "Unknown table"
- [x] Update client/src/adapters/indexedDbStorage.ts:
  - [x] Apply same validation logic as memoryStorage
  - [x] Wrap validation errors in consistent format
  - [x] Ensure errors are thrown (not silently ignored)
- [x] Write tests in client/src/adapters/__tests__/storage-validation.test.ts:
  - [x] Invalid hydration state throws
  - [x] Invalid transition (ready→notStarted) throws
  - [x] Valid transitions succeed
  - [x] Invalid cursor (number) throws
  - [x] Valid cursor (string, null) succeeds
  - [x] Mutation missing clientId throws
  - [x] Mutation missing mutationId throws
  - [x] Unknown table throws
  - [x] Test both memory and IndexedDB adapters

## Verification Steps

### Automated Tests

```bash
# Run storage validation tests
npm test client/src/adapters/__tests__/storage-validation.test.ts

# Expected: All tests pass
```

### Manual Verification (JavaScript/Node)

```javascript
// Test memory storage
const { createMemoryStorage } = require('@datafn/client');
const storage = createMemoryStorage();

// Test invalid hydration state
try {
  await storage.setHydrationState('tasks', 'invalid_state');
  console.error('FAIL: Should have thrown');
} catch (err) {
  console.log('PASS:', err.message); // Should match /Invalid hydration state/
}

// Test invalid transition
await storage.setHydrationState('tasks', 'ready');
try {
  await storage.setHydrationState('tasks', 'notStarted');
  console.error('FAIL: Should have thrown');
} catch (err) {
  console.log('PASS:', err.message); // Should match /Invalid.*transition/
}

// Test invalid cursor
try {
  await storage.setCursor('tasks', 12345); // Number, not string
  console.error('FAIL: Should have thrown');
} catch (err) {
  console.log('PASS:', err.message); // Should match /Invalid cursor/
}

// Test missing clientId
try {
  await storage.appendToChangelog({
    mutationId: 'mut-1',
    // clientId missing
    resource: 'tasks',
    operation: 'insert',
    record: {}
  });
  console.error('FAIL: Should have thrown');
} catch (err) {
  console.log('PASS:', err.message); // Should match /Missing clientId/
}
```

### Test Vectors Verification

Run test vectors:
- TV-STORAGE-INVALID-STATE-001
- TV-STORAGE-INVALID-CURSOR-001
- TV-STORAGE-INVALID-MUTATION-001
- TV-STORAGE-MEM-INVALID-001
- TV-STORAGE-MEM-TRANSITION-001
- TV-STORAGE-IDB-INVALID-001
- TV-STORAGE-IDB-CURSOR-001
- TV-STORAGE-IDB-CHANGELOG-001

Expected: All 8 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms deterministic rejection
3. ✅ Test vectors TV-STORAGE-* pass
4. ✅ Both memory and IndexedDB adapters validate correctly
5. ✅ Error messages are deterministic and testable
6. ✅ No regressions in existing client tests

**Estimated Duration**: 2 days

**Dependencies**: None (client-side only)

**Blocks**: PHASE_09 (offline queries use validated storage)
