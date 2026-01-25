# DataFn Audit Fix Comprehensive Implementation Plan

## Architecture Sketch

### Package Dependencies

```
@datafn/core (foundation)
├── Types, envelopes, schema validation
├── DFQL normalization, dfqlKey
└── Error codes and helpers

@datafn/client (depends on: core)
├── Client creation and table registry
├── Query/mutation/transact delegation
├── Signals and reactive queries
├── Events and subscription filtering
├── Storage adapters (memory, IndexedDB)
├── Offline query execution
├── Changelog and sync apply
└── Extension RPC transport

@datafn/server (depends on: core, @superfunctions/http, @superfunctions/db)
├── Server creation and HTTP routes
├── Authorization middleware
├── Query execution (select, filters, sort, pagination, aggregation)
├── Mutation execution (insert, merge, replace, delete, relation ops)
├── Transact execution (atomic, query+mutation steps)
├── Sync execution (seed, clone, pull, push)
├── Plugin system (hooks, ordering, runsOn)
├── Change tracking and idempotency
└── REST wrappers

@datafn/svelte (depends on: client)
└── toSvelteStore adapter

@datafn/cli (depends on: core)
├── Schema validation
├── TypeScript codegen
└── Migration diff and render

datafn (Python, depends on: SQLAlchemy or DB adapter)
├── Server creation
├── Endpoint handlers (query, mutation, transact, sync)
├── Envelope helpers
├── Idempotency and change tracking
└── Schema validation

```

### Module Boundaries

- **core**: No runtime dependencies; pure functions for validation, normalization, typing
- **client**: Browser + Node.js compatible; no server dependencies
- **server**: Node.js/Bun only; requires DB adapter
- **Python**: Server-only; mirrors TypeScript server contract

---

## Dependency Graph

### Critical Path

```
PHASE_00 (Auth ordering) → PHASE_01 (Validation) → PHASE_02 (Execution errors)
  ↓
PHASE_03 (Guards) → PHASE_04 (Replace) → PHASE_05 (Relation mutations)
  ↓
PHASE_06 (Transact atomicity + query steps)
  ↓
PHASE_07 (Pagination: nextCursor)
  ↓
PHASE_08 (Storage validation) → PHASE_09 (Offline DFQL expansion)
  ↓
PHASE_10 (Extension RPC + Docs)
  ↓
PHASE_11 (Python: endpoints) → PHASE_12 (Python: transact) → PHASE_13 (Python: sync)
  ↓
PHASE_14 (Search integration)
  ↓
PHASE_15 (Completeness: filters, aggregations, limits, observability)
```

### Parallel Opportunities

- Phases 03, 04, 05 (mutations) can be partially parallelized after Phase 02
- Phases 08, 10 can be parallelized (storage + docs independent)
- Phases 11, 12, 13 (Python) can follow after Phase 06 (transact spec finalized)
- Phase 14 (search) independent after Phase 02 (execution errors)

---

## Phases Overview

### Foundation (Phases 00-02): Core Correctness

**Goal**: Fix highest-risk determinism and validation issues

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 00 | Fix invalid JSON ordering | Authorization only runs on valid JSON | Unit tests: invalid JSON returns DFQL_INVALID |
| 01 | Schema-bounded validation | All endpoints validate resources/fields/relations | Unit tests: unknown resource/field/relation returns DFQL_UNKNOWN_* |
| 02 | Execution error surfacing | Query/mutation errors surface deterministically | Unit tests: invalid DFQL returns errors (not empty results) |

### Mutation Completeness (Phases 03-05): Write Semantics

**Goal**: Implement complete DFQL mutation semantics

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 03 | Optimistic concurrency guards | `if` guards enforced on mutations | Unit tests: guard match/mismatch scenarios |
| 04 | Replace operation semantics | `replace` clears unspecified fields | Unit tests: replace vs merge behavior |
| 05 | Relation mutations | relate/modifyRelation/unrelate ops | Unit tests: relation ops with metadata |

### Transact (Phase 06): Atomic Multi-Step

**Goal**: Implement atomic transactions with query+mutation steps

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 06 | Atomic transactions + query steps | Transact with rollback, query+mutation steps, limits | Unit tests: atomic rollback, read-your-writes |

### Pagination (Phase 07): Stable Traversal

**Goal**: Implement cursor pagination with nextCursor emission

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 07 | nextCursor emission + backwards pagination | Cursor pagination works end-to-end | Unit tests: nextCursor values, cursor.before |

### Storage & Offline (Phases 08-09): Local-First

**Goal**: Robust storage adapters and complete local DFQL

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 08 | Storage adapter validation | Adapters reject invalid inputs deterministically | Unit tests: invalid state/cursor/mutation rejected |
| 09 | Local DFQL expansion | Offline queries support relations and groupBy | Unit tests: local relation expansion, aggregations |

### Extension & Docs (Phase 10): Correctness & Clarity

**Goal**: Fix RPC and documentation mismatches

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 10 | Extension RPC + README fixes | subscriptionId delivery, accurate docs | Unit tests: RPC events; manual docs review |

### Python Parity (Phases 11-13): Cross-Language

**Goal**: Python server parity with TypeScript

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 11 | Python query + mutation | POST /datafn/query, /datafn/mutation | Integration tests: Python server vs TS server |
| 12 | Python transact | POST /datafn/transact with atomicity | Integration tests: transact atomicity |
| 13 | Python sync | POST /datafn/seed/clone/pull/push | Integration tests: sync endpoints |

### Search Integration (Phase 14): Full-Text/Semantic

**Goal**: searchfn plugin integration

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 14 | searchfn integration | Candidate selection + DFQL merge, index updates | Unit tests: search + filters, index updates on mutations |

### Completeness (Phase 15): Polish

**Goal**: Additional filters, aggregation improvements, limits, observability

| Phase | Goal | Delivered Capability | Verification |
|-------|------|---------------------|--------------|
| 15 | Completeness | Nested object filters, aggregate ordering, payload limits, log redaction | Unit tests: all P2 requirements |

---

## Definition of Done (Global)

### Per-Phase Completion Criteria

A phase is complete when ALL of the following are true:
1. ✅ All deliverable files created/modified as specified
2. ✅ All implementation tasks checked off
3. ✅ All test vectors for covered requirements execute and PASS
4. ✅ Manual verification steps completed (for docs/observability)
5. ✅ No regressions in existing test suites
6. ✅ Phase completion report written documenting outcomes and any deviations

### Overall Spec Completion Criteria

The spec is fully implemented when ALL of the following are true:
1. ✅ All 16 phases completed (PHASE_00 through PHASE_15)
2. ✅ All P0 requirements (20 requirements) status: PASS
3. ✅ All P1 requirements (30 requirements) status: PASS
4. ✅ All P2 requirements (30 requirements) status: PASS or explicitly documented as deferred with rationale
5. ✅ All 5 identified spec conflicts resolved:
   - SC-01: Error path conventions unified (use Bundle C convention: `details.path: "tables"`)
   - SC-02: Pagination semantics unified (nextCursor emission implemented)
   - SC-03: Event filter surface unified (action/fields/contextKeys implemented)
   - SC-04: Error code details.path made mandatory everywhere
   - SC-05: Search integration scope unified (P1 implementation complete)
6. ✅ All 3 major spec gaps closed:
   - Bundle C narrow scope: Full DFQL semantics restored
   - Bundle A client under-specification: Client surfaces fully specified
   - Bundle B SPEC.md-only semantics: All semantics normatively required
7. ✅ Audit re-run shows 100% PASS for all 59 intent items (I01-I59)
8. ✅ Documentation 100% accurate with implementation:
   - core/README.md: DatafnError described as interface
   - client/README.md: Uses "filters" (not "where"), canonical operations
   - server/README.md: Correct capability strings
   - svelte/README.md: Complete createDatafnClient example
9. ✅ Python-TypeScript server parity verified end-to-end:
   - All endpoints return identical wire formats
   - Invalid JSON determinism matches
   - Idempotency persistence matches
10. ✅ Cross-cutting audits pass:
    - Authorization ordering correct
    - Determinism invariants upheld (no Date.now/Math.random in execution)
    - Schema-bounded validation complete
    - Storage adapter robustness complete
    - Search integration complete

---

## Execution Strategy

### Development Workflow

1. **Phase Kickoff**:
   - Read PHASE_XX.md for detailed scope and tasks
   - Review requirements covered by phase
   - Review test vectors for phase

2. **Implementation**:
   - Create/modify deliverable files in order
   - Check off implementation tasks as completed
   - Write tests alongside implementation (TDD encouraged)

3. **Verification**:
   - Run test vectors for phase requirements
   - Run full test suite to check for regressions
   - Execute manual verification steps (for docs/observability)

4. **Phase Completion**:
   - Write phase completion report
   - Commit changes with descriptive message
   - Proceed to next phase

### Testing Strategy

- **Unit Tests**: Per-module tests for core, client, server, Python
- **Integration Tests**: Cross-module tests for sync, transact, search
- **Contract Tests**: Python vs TypeScript server wire compatibility
- **Test Vector Execution**: Automated scripts execute all test vectors and report pass/fail

### Rollback Strategy

- Each phase is independently committed
- If a phase fails verification, rollback to previous phase commit
- Fix issues and re-run verification
- Do not proceed to next phase until current phase passes all criteria

---

## Risk Mitigation

### High-Risk Areas

1. **Transact Atomicity** (Phase 06):
   - Requires DB adapter transaction support
   - Mitigation: Verify adapter API in Phase 06 kickoff; add transaction methods to @superfunctions/db if needed

2. **Python Parity** (Phases 11-13):
   - Large surface area; wire format compatibility critical
   - Mitigation: Contract tests compare Python vs TS responses for identical inputs; auto-generate test cases from TS test vectors

3. **Search Integration** (Phase 14):
   - Depends on external searchfn plugin
   - Mitigation: Mock plugin for testing; document plugin contract clearly

4. **Offline DFQL Expansion** (Phase 09):
   - Complex relation traversal logic
   - Mitigation: Reuse server query execution logic where possible; extensive test coverage for edge cases

### Scope Management

- **No Scope Creep**: Deferred features (cascade, custom conflict resolution, GraphQL) remain deferred
- **No MVP Reduction**: All 80 requirements must be addressed; P2 requirements may be documented as deferred if time-boxed but must have explicit rationale

---

## Estimated Timeline

Assuming 1 developer working full-time:

- **Foundation** (Phases 00-02): 3-5 days
- **Mutation Completeness** (Phases 03-05): 5-7 days
- **Transact** (Phase 06): 3-5 days
- **Pagination** (Phase 07): 2-3 days
- **Storage & Offline** (Phases 08-09): 5-7 days
- **Extension & Docs** (Phase 10): 2-3 days
- **Python Parity** (Phases 11-13): 7-10 days
- **Search Integration** (Phase 14): 3-5 days
- **Completeness** (Phase 15): 3-5 days

**Total**: 33-50 days (6-10 weeks)

With 2-3 developers parallelizing phases:
**Total**: 20-30 days (4-6 weeks)

---

## Success Metrics

At completion:
- ✅ 100% of test vectors pass
- ✅ 0 high-priority audit findings remaining
- ✅ 0 documentation mismatches
- ✅ Python-TypeScript parity verified by contract tests
- ✅ All 59 intent items from audit status: PASS
- ✅ All 5 spec conflicts resolved
- ✅ All 3 spec gaps closed

---

## Next Steps

1. **Review and Approve Spec**: Stakeholders review SPEC.md, REQUIREMENTS.md, TEST_VECTORS.md, PLAN.md
2. **Environment Setup**: Verify @superfunctions/db transaction API, set up Python dev environment
3. **Phase 00 Kickoff**: Read phases/PHASE_00.md and begin implementation
4. **Continuous Integration**: Set up CI to run test vectors on each commit
5. **Progress Tracking**: Update phase completion status in project tracking tool

---

**Spec Complete. Ready for Implementation.**
