# PHASE_14: Search Integration

## Phase Goal

Implement searchfn plugin integration for full-text and semantic search with deterministic DFQL merge over candidate sets and index updates on mutations.

## In Scope

- searchfn plugin candidate selection
- Deterministic DFQL merge (filters + sort + pagination over candidates)
- Index updates on successful mutations
- Search rejection when plugin not installed
- Plugin contract definition

## Out of Scope

- searchfn plugin implementation (external dependency)
- Semantic search backend
- Vector database integration details

## Deliverables

- `server/src/execution/query/search.ts` - Search integration (new)
- `server/src/routes/query.ts` - Search validation and delegation
- `server/src/plugins/searchfn.ts` - searchfn plugin interface (new)
- `server/src/execution/mutation/execute.ts` - Index update hooks
- `server/src/execution/query/__tests__/search.test.ts` - Search tests

## Requirements Covered

- **SEARCH-001**: searchfn candidate selection (P1)
- **SEARCH-002**: Deterministic DFQL merge over candidates (P1)
- **SEARCH-003**: Index updates on mutations (P1)

## Implementation Tasks

### Plugin Interface

- [ ] Create server/src/plugins/searchfn.ts:
  - [ ] Define SearchFnPlugin interface:
    ```typescript
    interface SearchFnPlugin extends DatafnPlugin {
      name: 'searchfn';
      selectCandidates(params: {
        resource: string;
        query: string;
        type: 'fullText' | 'semantic';
        fields?: string[];
        topK?: number;
      }): Promise<string[]>; // Returns candidate ids
      
      updateIndices(params: {
        resource: string;
        records: Record<string, unknown>[];
        operation: 'upsert' | 'delete';
      }): Promise<void>;
    }
    ```
  - [ ] Export SearchFnPlugin interface

### Search Execution

- [ ] Create server/src/execution/query/search.ts:
  - [ ] `executeSearchQuery(adapter, schema, query, searchPlugin)`:
    - [ ] Call searchPlugin.selectCandidates(query.search)
    - [ ] Get candidate ids
    - [ ] Build implicit filter: `{ $and: [query.filters || {}, { id: { in: candidateIds } }] }`
    - [ ] Execute query with merged filters
    - [ ] Apply sort + pagination deterministically
    - [ ] Return query result
  - [ ] Ensure deterministic ordering when sort specified
  - [ ] Candidate set is treated as pre-filter (AND with query.filters)

### Query Route Integration

- [ ] Update server/src/routes/query.ts:
  - [ ] Check if query.search is present:
    - [ ] If no search block: execute normally
    - [ ] If search block present:
      - [ ] Find searchfn plugin in config.plugins
      - [ ] If plugin not found: return DFQL_UNSUPPORTED error
      - [ ] If plugin found: call executeSearchQuery
  - [ ] Validate search block structure
  - [ ] Return search results

### Index Updates

- [ ] Update server/src/execution/mutation/execute.ts:
  - [ ] After successful mutation, check for searchfn plugin
  - [ ] If plugin present:
    - [ ] For insert/merge/replace: call plugin.updateIndices with operation: 'upsert'
    - [ ] For delete: call plugin.updateIndices with operation: 'delete'
    - [ ] Pass affected records/ids
  - [ ] Plugin runs in afterMutation hook (fail-open)

### Tests

- [ ] Write tests in server/src/execution/query/__tests__/search.test.ts:
  - [ ] Search with plugin returns filtered results
  - [ ] Search candidates merged with query filters (AND logic)
  - [ ] Search without plugin returns DFQL_UNSUPPORTED
  - [ ] Search with sort applies ordering deterministically
  - [ ] Search with pagination works correctly
  - [ ] Index updates called on mutations

## Verification Steps

### Automated Tests

```bash
# Run search tests
npm test server/src/execution/query/__tests__/search.test.ts

# Expected: All tests pass
```

### Manual Verification

```bash
# Setup: Start server with searchfn plugin installed (mock plugin for testing)

# Test search with plugin
curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{
    "resource":"tasks",
    "version":"1",
    "search":{"query":"urgent","type":"fullText","fields":["title","description"]},
    "filters":{"status":"active"}
  }'

# Expected: Returns tasks matching search AND active status
# Plugin returns candidate ids: ["task-1", "task-5", "task-10"]
# Results: Only task-1 and task-5 (task-10 filtered out by status)

# Test search without plugin
# Restart server without searchfn plugin

curl -X POST http://localhost:3000/datafn/query \
  -H "Content-Type: application/json" \
  -d '{
    "resource":"tasks",
    "version":"1",
    "search":{"query":"urgent","type":"fullText"}
  }'

# Expected: {"ok":false,"error":{"code":"DFQL_UNSUPPORTED","message":"Search requires searchfn plugin","details":{"path":"search"}}}

# Test index updates
# With plugin installed, create a mutation

curl -X POST http://localhost:3000/datafn/mutation \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","version":"1","clientId":"client-1","mutationId":"mut-1","operation":"insert","record":{"title":"Urgent task"}}'

# Verify: Plugin updateIndices called (check logs or mock spy)
```

### Test Vectors Verification

Run test vectors:
- TV-SEARCH-CANDIDATES-001
- TV-SEARCH-NOPLUGIN-001
- TV-SEARCH-MERGE-001
- TV-SEARCH-FILTER-001
- TV-SEARCH-SORT-001
- TV-SEARCH-INDEX-UPDATE-001

Expected: All 6 vectors pass

## Stop Condition

Report completion when:
1. ✅ All automated tests pass
2. ✅ Manual verification confirms search integration works
3. ✅ Test vectors TV-SEARCH-* pass
4. ✅ Search without plugin returns DFQL_UNSUPPORTED
5. ✅ DFQL merge over candidates is deterministic
6. ✅ Index updates called on mutations
7. ✅ No regressions in existing query tests

**Estimated Duration**: 3-4 days

**Dependencies**: PHASE_02 (error handling), PHASE_07 (pagination for search results)

**Blocks**: None (completes search feature)
