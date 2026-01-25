# PHASE_09: Local DFQL Expansion

## Phase Goal

Expand client offline query executor to support relation expansions and groupBy/aggregations, enabling complete DFQL semantics for local-first queries on ready tables.

## In Scope

- Relation expansion tokens (rel, rel.*, nested)
- Many-many tokens (rel.#, rel.*#)
- groupBy with aggregations (count, sum, avg, min, max)
- having filters on grouped results
- Local join table storage and querying
- Deterministic ordering for relations

## Out of Scope

- Server query changes (already complete)
- Search integration in offline queries (deferred)
- htree relations in offline (deferred to PHASE_15)

## Deliverables

- `client/src/offline/query.ts` - Expanded local query executor
- `client/src/offline/relations.ts` - Relation expansion logic (new)
- `client/src/offline/aggregate.ts` - Aggregation logic (new)
- `client/src/storage.ts` - Updated interface for join tables
- `client/src/adapters/memoryStorage.ts` - Join table storage
- `client/src/adapters/indexedDbStorage.ts` - Join table storage
- `client/src/offline/__tests__/local-dfql.test.ts` - Local DFQL tests

## Requirements Covered

- **OFFLINE-001**: Local DFQL expansion (relations) (P1)
- **OFFLINE-002**: Local DFQL expansion (groupBy) (P1)

## Implementation Tasks

- [x] Update client/src/storage.ts interface:
  - [x] Add `getRelatedIds(table, id, relationName)` → returns ids (via `findRecords` / `getJoinRows` logic)
  - [x] Add `getJoinRows(relationName, fromId)` → returns join rows with metadata
  - [x] Add `setJoinRows(relationName, rows)` → stores join rows
- [x] Update storage adapters (memory and IndexedDB):
  - [x] Implement getRelatedIds (read FK or join table) - implemented as logic in `relations.ts`
  - [x] Implement getJoinRows (read from join table)
  - [x] Implement setJoinRows (write to join table)
- [x] Create client/src/offline/relations.ts:
  - [x] `expandRelation(storage, schema, resource, record, relationToken)`:
    - [x] Parse token (e.g., "tags", "tags.*", "tags.#", "tasks.tags.*")
    - [x] For ids-only token: return getRelatedIds()
    - [x] For expansion token: fetch related records from storage
    - [x] For join token (#): return join rows
    - [x] For expanded join token (*#): fetch records + attach metadata
    - [x] For nested token: recursively expand intermediate relations
    - [x] Return expanded value
  - [x] `materializeSelect(storage, schema, resource, records, select)`:
    - [x] For each select token:
      - [x] If base field: include from record
      - [x] If relation token: call expandRelation for each record
    - [x] Return expanded records
- [x] Create client/src/offline/aggregate.ts:
  - [x] `executeAggregateQuery(storage, schema, query)`:
    - [x] Fetch all records for resource
    - [x] Apply filters
    - [x] Group by specified fields
    - [x] Compute aggregations (count, sum, avg, min, max)
    - [x] Apply having filters
    - [x] Sort groups deterministically
    - [x] Apply pagination
    - [x] Return { groups, nextCursor }
- [x] Update client/src/offline/query.ts:
  - [x] Check if query has groupBy:
    - [x] If yes: call executeAggregateQuery
    - [x] If no: continue with existing logic
  - [x] After fetching records, check if select has relation tokens:
    - [x] If yes: call materializeSelect with relation expansion
    - [x] If no: apply select as before
  - [x] Ensure deterministic ordering for all results
- [x] Write tests in client/src/offline/__tests__/local-dfql.test.ts:
  - [x] Local query expands many-one relation
  - [x] Local query expands many-many relation with metadata
  - [x] Local query expands nested relations (tasks.tags.*)
  - [x] Local query groupBy with count aggregation
  - [x] Local query groupBy with sum/avg/min/max
  - [x] Local query having filter on aggregations
  - [x] Ordering is deterministic

## Verification Steps

### Automated Tests

```bash
# Run local DFQL tests
npm test client/src/offline/__tests__/local-dfql.test.ts

# Run storage tests (join tables)
npm test client/src/adapters/__tests__/storage.test.ts

# Expected: All tests pass
```

### Manual Verification (Browser or Node)

```javascript
// Setup: Populate local storage with tasks, projects, tags
const client = createDatafnClient({
  schema,
  remote: remoteAdapter,
  storage: createMemoryStorage(),
  offlinability: true
});

// Clone to populate local storage
await client.sync.clone({ clientId: 'client-1' });

// Test local relation expansion (offline)
const result = await client.tasks.query({
  filters: { id: 'task-1' },
  select: ['title', 'project.*', 'tags.*']
});

console.log('Task with relations:', result.data[0]);
// Expected: {
//   id: 'task-1',
//   title: 'Task',
//   project: { id: 'project-1', name: 'Project', ... },
//   tags: [{ id: 'tag-1', name: 'Tag1', ... }, ...]
// }

// Test local aggregation (offline)
const aggResult = await client.tasks.query({
  groupBy: ['status'],
  aggregations: { total: { op: 'count' } }
});

console.log('Grouped by status:', aggResult.groups);
// Expected: [
//   { status: 'active', total: 5 },
//   { status: 'completed', total: 3 }
// ]
```

### Test Vectors Verification

Run test vectors:
- TV-OFFLINE-QUERY-REL-001
- TV-OFFLINE-QUERY-NESTED-001
- TV-OFFLINE-QUERY-MANYMANY-001
- TV-OFFLINE-QUERY-GROUPBY-001
- TV-OFFLINE-QUERY-AGG-001
- TV-OFFLINE-QUERY-HAVING-001

Expected: All 6 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms local relation expansion works
3. ✅ Test vectors TV-OFFLINE-QUERY-* pass
4. ✅ Local aggregations work correctly
5. ✅ Join table storage implemented in both adapters
6. ✅ No regressions in existing offline query tests

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_08 (storage validation), PHASE_05 (relation semantics established)

**Blocks**: None (completes offline feature set)
