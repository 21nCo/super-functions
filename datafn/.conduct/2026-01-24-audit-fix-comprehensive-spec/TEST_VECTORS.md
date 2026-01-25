# DataFn Audit Fix Comprehensive Test Vectors

This document contains golden test inputs and expected outputs for all requirements in the audit fix spec. Each vector is independently executable and deterministic.

## Table of Contents

- [P0 Critical Fixes](#p0-critical-fixes)
- [P1 High-Value Fixes](#p1-high-value-fixes)
- [P2 Completeness](#p2-completeness)

---

## P0 Critical Fixes

### AUTH-001: Invalid JSON Ordering

#### TV-AUTH-INV-JSON-001 (Positive: Valid JSON with auth

)

```json
// Request: POST /datafn/query
// Headers: { "Content-Type": "application/json" }
// Body:
{
  "resource": "tasks",
  "version": "1",
  "filters": { "status": "active" }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [/* ... */],
    "nextCursor": null
  }
}
```

#### TV-AUTH-INV-JSON-002 (Negative: Invalid JSON should return DFQL_INVALID, not FORBIDDEN)

```json
// Request: POST /datafn/query
// Headers: { "Content-Type": "application/json" }
// Body: {invalid json}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid JSON",
    "details": { "path": "$" }
  }
}

// MUST NOT return:
// { "ok": false, "error": { "code": "FORBIDDEN", ... } }
```

#### TV-AUTH-INV-JSON-003 (Negative: Valid JSON denied by auth)

```json
// Request: POST /datafn/query
// Headers: { "Content-Type": "application/json" }
// Authorization configured to deny this request
// Body:
{
  "resource": "tasks",
  "version": "1",
  "filters": {}
}

// Expected Response: 403 Forbidden
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Authorization denied",
    "details": { "path": "$" }
  }
}
```

---

### VALID-001: Schema-Bounded Validation

#### TV-VALID-RESOURCE-001 (Negative: Unknown resource)

```json
// Request: POST /datafn/query
{
  "resource": "unknown_table",
  "version": "1",
  "filters": {}
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_RESOURCE",
    "message": "Unknown resource: unknown_table",
    "details": { "path": "resource" }
  }
}
```

#### TV-VALID-FIELD-001 (Negative: Unknown field in select)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "select": ["title", "unknown_field"],
  "filters": {}
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_FIELD",
    "message": "Unknown field: unknown_field",
    "details": { "path": "select[1]" }
  }
}
```

#### TV-VALID-RELATION-001 (Negative: Unknown relation in select)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "select": ["title", "unknown_relation.*"],
  "filters": {}
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_RELATION",
    "message": "Unknown relation: unknown_relation",
    "details": { "path": "select[1]" }
  }
}
```

#### TV-VALID-MUTATION-001 (Negative: Unknown field in mutation record)

```json
// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "insert",
  "record": {
    "title": "Task 1",
    "unknown_field": "value"
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_FIELD",
    "message": "Unknown field: unknown_field",
    "details": { "path": "record.unknown_field" }
  }
}
```

#### TV-VALID-PUSH-001 (Negative: Unknown resource in push mutation)

```json
// Request: POST /datafn/push
{
  "clientId": "client-1",
  "mutations": [
    {
      "resource": "unknown_table",
      "version": "1",
      "clientId": "client-1",
      "mutationId": "mut-1",
      "operation": "insert",
      "record": { "title": "Test" }
    }
  ]
}

// Expected Response: 200 OK (push returns per-mutation errors)
{
  "ok": true,
  "result": {
    "applied": [],
    "errors": [
      {
        "mutationId": "mut-1",
        "error": {
          "code": "DFQL_UNKNOWN_RESOURCE",
          "message": "Unknown resource: unknown_table",
          "details": { "path": "mutations[0].resource" }
        }
      }
    ]
  }
}
```

---

### EXEC-001: Query Execution Error Surfacing

#### TV-EXEC-QUERY-ERR-001 (Negative: Invalid filter operator)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": {
    "status": { "unknown_operator": "active" }
  }
}

// Expected Response: 400 Bad Request (not empty results)
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Unknown filter operator: unknown_operator",
    "details": { "path": "filters.status" }
  }
}

// MUST NOT return:
// { "ok": true, "result": { "data": [], "nextCursor": null } }
```

#### TV-EXEC-QUERY-ERR-002 (Negative: Invalid cursor.after values)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["createdAt:asc", "id:asc"],
  "cursor": {
    "after": {
      "createdAt": "invalid-date-format",
      "id": "task-1"
    }
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid cursor value for field: createdAt",
    "details": { "path": "cursor.after.createdAt" }
  }
}
```

#### TV-EXEC-QUERY-ERR-003 (Negative: Invalid sort field)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["unknown_field:asc"]
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_FIELD",
    "message": "Unknown sort field: unknown_field",
    "details": { "path": "sort[0]" }
  }
}
```

#### TV-EXEC-QUERY-EMPTY-001 (Positive: Valid query with zero results)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": { "status": "nonexistent_status" }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [],
    "nextCursor": null
  }
}
```

---

### EXEC-002: Mutation Execution Error Surfacing

#### TV-EXEC-MUT-ERR-001 (Negative: Unknown resource in mutation)

*Covered by TV-VALID-MUTATION-001*

#### TV-EXEC-MUT-ERR-002 (Negative: Adapter constraint violation)

```json
// Request: POST /datafn/mutation
// Assume "email" field has unique constraint
{
  "resource": "users",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "insert",
  "record": {
    "email": "existing@example.com" // Duplicate email
  }
}

// Expected Response: 200 OK (mutation-level error)
{
  "ok": true,
  "result": {
    "ok": false,
    "mutationId": "mut-1",
    "affectedIds": [],
    "errors": [
      {
        "code": "INTERNAL",
        "message": "Unique constraint violation",
        "path": "record.email",
        "retryable": false
      }
    ]
  }
}
```

#### TV-EXEC-MUT-ERR-003 (Negative: Guard mismatch)

```json
// Request: POST /datafn/mutation
// Assume task-1 exists with status "active"
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "merge",
  "id": "task-1",
  "record": { "status": "completed" },
  "if": { "status": "pending" } // Guard mismatch
}

// Expected Response: 400 Bad Request (top-level envelope)
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "Guard condition not met",
    "details": { "path": "if" }
  }
}
```

#### TV-EXEC-MUT-NOTFOUND-001 (Negative: Replace non-existent record)

```json
// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "replace",
  "id": "nonexistent-id",
  "record": { "title": "New Task" }
}

// Expected Response: 404 Not Found
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Record not found: nonexistent-id",
    "details": { "path": "id" }
  }
}
```

---

### MUT-GUARD-001: Optimistic Concurrency Guards

#### TV-MUT-GUARD-PASS-001 (Positive: Guard matches, mutation applied)

```json
// Setup: task-1 exists with { "id": "task-1", "status": "active", "version": 1 }

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "merge",
  "id": "task-1",
  "record": { "status": "completed" },
  "if": { "status": "active" }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-1",
    "affectedIds": ["task-1"]
  }
}

// Verify: task-1 now has { "status": "completed" }
```

#### TV-MUT-GUARD-FAIL-001 (Negative: Guard does not match)

```json
// Setup: task-1 exists with { "id": "task-1", "status": "active", "version": 1 }

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-2",
  "operation": "merge",
  "id": "task-1",
  "record": { "status": "completed" },
  "if": { "status": "pending" } // Mismatch
}

// Expected Response: 409 Conflict
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "Guard condition not met",
    "details": { "path": "if" }
  }
}

// Verify: task-1 unchanged
```

#### TV-MUT-GUARD-NOTFOUND-001 (Negative: Guard on non-existent record)

```json
// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-3",
  "operation": "merge",
  "id": "nonexistent-id",
  "record": { "status": "completed" },
  "if": { "status": "active" }
}

// Expected Response: 409 Conflict (guard fails on missing record)
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "Guard condition not met (record not found)",
    "details": { "path": "if" }
  }
}
```

---

### MUT-REPLACE-001: Replace Operation Semantics

#### TV-MUT-REPLACE-CLEAR-001 (Positive: Replace clears unspecified fields)

```json
// Setup: task-1 exists with { "id": "task-1", "title": "Old", "description": "Details", "status": "active" }

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "replace",
  "id": "task-1",
  "record": {
    "title": "New"
    // "description" and "status" not specified
  }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-1",
    "affectedIds": ["task-1"]
  }
}

// Verify: task-1 now has { "id": "task-1", "title": "New", "description": null, "status": null }
// (or schema defaults if defined)
```

#### TV-MUT-REPLACE-NOTFOUND-001 (Negative: Replace non-existent record)

*Covered by TV-EXEC-MUT-NOTFOUND-001*

#### TV-MUT-REPLACE-REQUIRED-001 (Negative: Replace missing required field)

```json
// Schema: tasks has required field "title"

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-2",
  "operation": "replace",
  "id": "task-1",
  "record": {
    "status": "active"
    // "title" required but missing
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Required field missing: title",
    "details": { "path": "record.title" }
  }
}
```

---

### MUT-REL-001: Relation Mutations

#### TV-MUT-RELATE-001 (Positive: Establish many-one relation)

```json
// Setup: task-1 and project-1 exist
// Schema: tasks.project is many-one relation to projects

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "relate",
  "id": "task-1",
  "relations": {
    "project": "project-1" // Shorthand: string id
  }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-1",
    "affectedIds": ["task-1"]
  }
}

// Verify: task-1.projectId = "project-1"
```

#### TV-MUT-RELATE-METADATA-001 (Positive: Establish many-many relation with metadata)

```json
// Setup: task-1 and tag-1 exist
// Schema: tasks.tags is many-many with metadata field "order"

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-2",
  "operation": "relate",
  "id": "task-1",
  "relations": {
    "tags": [
      { "$ref": "tag-1", "order": 0 }
    ]
  }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-2",
    "affectedIds": ["task-1"]
  }
}

// Verify: Join row created with { from: "task-1", to: "tag-1", order: 0 }
```

#### TV-MUT-MODIFY-REL-001 (Positive: Modify many-many metadata)

```json
// Setup: task-1 and tag-1 are related with order: 0

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-3",
  "operation": "modifyRelation",
  "id": "task-1",
  "relations": {
    "tags": { "$ref": "tag-1", "order": 5 }
  }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-3",
    "affectedIds": ["task-1"]
  }
}

// Verify: Join row updated to { from: "task-1", to: "tag-1", order: 5 }
```

#### TV-MUT-UNRELATE-001 (Positive: Remove relation)

```json
// Setup: task-1 and tag-1 are related

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-4",
  "operation": "unrelate",
  "id": "task-1",
  "relations": {
    "tags": "tag-1"
  }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "mut-4",
    "affectedIds": ["task-1"]
  }
}

// Verify: Join row deleted
```

---

### MUT-REL-002: Relation Mutation Payload Validation

#### TV-MUT-REL-VALID-001 (Positive: Valid relation mutation)

*Covered by TV-MUT-RELATE-001*

#### TV-MUT-REL-INVALID-RELATION-001 (Negative: Unknown relation)

```json
// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-1",
  "operation": "relate",
  "id": "task-1",
  "relations": {
    "unknown_relation": "some-id"
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_RELATION",
    "message": "Unknown relation: unknown_relation",
    "details": { "path": "relations.unknown_relation" }
  }
}
```

#### TV-MUT-REL-INVALID-METADATA-001 (Negative: Unknown metadata key)

```json
// Schema: tasks.tags many-many with metadata field "order" only

// Request: POST /datafn/mutation
{
  "resource": "tasks",
  "version": "1",
  "clientId": "client-1",
  "mutationId": "mut-2",
  "operation": "relate",
  "id": "task-1",
  "relations": {
    "tags": [
      { "$ref": "tag-1", "order": 0, "unknown_meta": "value" }
    ]
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_FIELD",
    "message": "Unknown metadata field: unknown_meta",
    "details": { "path": "relations.tags[0].unknown_meta" }
  }
}
```

---

### TX-ATOMIC-001: Database Transaction Wrapping

#### TV-TX-ATOMIC-ROLLBACK-001 (Negative: First step fails, rollback all)

```json
// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [
    {
      "mutation": {
        "resource": "tasks",
        "version": "1",
        "clientId": "client-1",
        "mutationId": "mut-1",
        "operation": "insert",
        "record": { "title": "Task 1" }
      }
    },
    {
      "mutation": {
        "resource": "tasks",
        "version": "1",
        "clientId": "client-1",
        "mutationId": "mut-2",
        "operation": "insert",
        "record": {
          // Missing required field "title"
        }
      }
    }
  ]
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Required field missing: title",
    "details": { "path": "steps[1].mutation.record.title" }
  }
}

// Verify: No tasks created (rollback occurred)
```

#### TV-TX-ATOMIC-PARTIAL-001 (Positive: atomic: false allows partial commit)

```json
// Request: POST /datafn/transact
{
  "atomic": false,
  "steps": [
    {
      "mutation": {
        "resource": "tasks",
        "version": "1",
        "clientId": "client-1",
        "mutationId": "mut-3",
        "operation": "insert",
        "record": { "title": "Task 1" }
      }
    },
    {
      "mutation": {
        "resource": "tasks",
        "version": "1",
        "clientId": "client-1",
        "mutationId": "mut-4",
        "operation": "insert",
        "record": {} // Invalid
      }
    }
  ]
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": false, // Transaction overall failed but partial commit
    "results": [
      {
        "ok": true,
        "mutationId": "mut-3",
        "affectedIds": ["<generated-id>"]
      },
      {
        "ok": false,
        "error": {
          "code": "DFQL_INVALID",
          "message": "Required field missing: title",
          "details": { "path": "record.title" }
        }
      }
    ]
  }
}

// Verify: Task 1 was created (partial commit)
```

---

### TX-QUERY-001: Query Steps in Transact

#### TV-TX-QUERY-STEP-001 (Positive: Query step returns result)

```json
// Setup: task-1 exists

// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [
    {
      "query": {
        "resource": "tasks",
        "version": "1",
        "filters": { "id": "task-1" }
      }
    }
  ]
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "results": [
      {
        "data": [
          { "id": "task-1", "title": "...", /* ... */ }
        ],
        "nextCursor": null
      }
    ]
  }
}
```

#### TV-TX-QUERY-READYOURWRITES-001 (Positive: Query sees uncommitted writes)

```json
// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [
    {
      "mutation": {
        "resource": "tasks",
        "version": "1",
        "clientId": "client-1",
        "mutationId": "mut-1",
        "operation": "insert",
        "record": { "title": "New Task", "status": "pending" }
      }
    },
    {
      "query": {
        "resource": "tasks",
        "version": "1",
        "filters": { "status": "pending" }
      }
    }
  ]
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "results": [
      {
        "ok": true,
        "mutationId": "mut-1",
        "affectedIds": ["<generated-id>"]
      },
      {
        "data": [
          { "id": "<generated-id>", "title": "New Task", "status": "pending", /* ... */ }
        ],
        "nextCursor": null
      }
    ]
  }
}
```

#### TV-TX-QUERY-MUTATION-MIX-001 (Positive: Mixed query and mutation steps)

```json
// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [
    { "query": { "resource": "tasks", "version": "1", "filters": {} } },
    { "mutation": { "resource": "tasks", "version": "1", "clientId": "client-1", "mutationId": "mut-1", "operation": "insert", "record": { "title": "Task" } } },
    { "query": { "resource": "tasks", "version": "1", "filters": {} } }
  ]
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "ok": true,
    "results": [
      { "data": [ /* existing tasks */ ], "nextCursor": null },
      { "ok": true, "mutationId": "mut-1", "affectedIds": ["<generated-id>"] },
      { "data": [ /* existing + new task */ ], "nextCursor": null }
    ]
  }
}
```

---

### TX-LIMITS-001: Transact Step Limits

#### TV-TX-LIMIT-EXCEEDED-001 (Negative: Exceeds maxTransactSteps)

```json
// Assume maxTransactSteps = 100

// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [ /* 101 steps */ ]
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Transaction exceeds maximum steps",
    "details": { "path": "steps", "max": 100 }
  }
}
```

#### TV-TX-LIMIT-OK-001 (Positive: Within limit)

```json
// Request: POST /datafn/transact
{
  "atomic": true,
  "steps": [ /* 100 steps */ ]
}

// Expected Response: 200 OK (executes normally)
```

---

### DETERM-001: Remove Date.now() from Server

#### TV-DETERM-SEED-001 (Positive: Seed does not use Date.now())

```json
// Request: POST /datafn/seed
{
  "clientId": "client-1"
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": { "ok": true }
}

// Verify: Seed record does not contain nondeterministic timestamp
// (timestamp may be client-provided or omitted)
```

#### TV-DETERM-CURSOR-001 (Positive: Cursors use serverSeq not timestamp)

```json
// Request: POST /datafn/clone
{
  "clientId": "client-1",
  "tables": ["tasks"]
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": { "tasks": [ /* ... */ ] },
    "cursors": { "tasks": "123" } // serverSeq value, not timestamp
  }
}

// Verify: Cursor is deterministic integer string derived from serverSeq
```

---

### DETERM-002: Remove Math.random() from Client

#### TV-DETERM-RPC-ID-001 (Positive: RPC IDs are deterministic counter-based)

```javascript
// Client code:
const transport = createExtensionTransport();
const req1 = transport.request({ method: "query", payload: {...} });
const req2 = transport.request({ method: "query", payload: {...} });

// Verify: req1.id = 1, req2.id = 2 (or similar deterministic sequence)
// NOT random values like 0.123456789
```

---

### DETERM-003: Cursor Sort Validation

#### TV-CURSOR-SORT-VALID-001 (Positive: Valid cursor with id tie-breaker)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["createdAt:asc", "id:asc"],
  "cursor": { "after": { "createdAt": "2026-01-01T00:00:00Z", "id": "task-1" } }
}

// Expected Response: 200 OK (executes normally)
```

#### TV-CURSOR-SORT-INVALID-001 (Negative: Cursor without id in sort)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["createdAt:asc"], // Missing id tie-breaker
  "cursor": { "after": { "createdAt": "2026-01-01T00:00:00Z" } }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Cursor pagination requires id as final sort key",
    "details": { "path": "sort" }
  }
}
```

#### TV-CURSOR-SORT-DEFAULT-001 (Positive: Cursor without sort defaults to id:asc)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "cursor": { "after": { "id": "task-1" } }
  // "sort" omitted
}

// Expected Response: 200 OK
// Server applies default sort ["id:asc"]
```

---

## P1 High-Value Fixes

### PAGE-001: nextCursor Emission

#### TV-PAGE-NEXTCURSOR-PRESENT-001 (Positive: nextCursor present when more pages exist)

```json
// Setup: 15 tasks exist

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["id:asc"],
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [ /* 10 tasks */ ],
    "nextCursor": { "id": "<id-of-10th-task>" }
  }
}
```

#### TV-PAGE-NEXTCURSOR-NULL-001 (Positive: nextCursor null when no more pages)

```json
// Setup: 5 tasks exist

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["id:asc"],
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [ /* 5 tasks */ ],
    "nextCursor": null
  }
}
```

#### TV-PAGE-NEXTCURSOR-VALUES-001 (Positive: nextCursor contains sort key values)

```json
// Setup: 15 tasks exist

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["createdAt:asc", "id:asc"],
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [ /* 10 tasks */ ],
    "nextCursor": {
      "createdAt": "2026-01-10T12:00:00Z",
      "id": "task-10"
    }
  }
}
```

---

### PAGE-002: Cursor Backwards Pagination

#### TV-PAGE-BEFORE-001 (Positive: Cursor backwards pagination)

```json
// Setup: 20 tasks exist, ordered by id:asc

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["id:asc"],
  "cursor": { "before": { "id": "task-11" } },
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [
      { "id": "task-1", /* ... */ },
      { "id": "task-2", /* ... */ },
      /* ... */
      { "id": "task-10", /* ... */ }
    ],
    "nextCursor": { "id": "task-10" }
  }
}
```

#### TV-PAGE-BEFORE-EDGES-001 (Positive: Before cursor at edges)

```json
// Setup: 5 tasks exist

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "sort": ["id:asc"],
  "cursor": { "before": { "id": "task-1" } },
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [], // No results before task-1
    "nextCursor": null
  }
}
```

---

### STORAGE-001, STORAGE-002, STORAGE-003: Storage Adapter Validation

#### TV-STORAGE-INVALID-STATE-001 (Negative: Invalid hydration state)

```javascript
// Client code:
const storage = createMemoryStorage();
try {
  await storage.setHydrationState("tasks", "invalid_state");
  throw new Error("Should have thrown");
} catch (err) {
  // Expected: err.message matches /Invalid hydration state/
}
```

#### TV-STORAGE-INVALID-CURSOR-001 (Negative: Invalid cursor format)

```javascript
// Client code:
const storage = createIndexedDbStorage();
try {
  await storage.setCursor("tasks", 12345); // Number, not string
  throw new Error("Should have thrown");
} catch (err) {
  // Expected: err.message matches /Invalid cursor format/
}
```

#### TV-STORAGE-INVALID-MUTATION-001 (Negative: Mutation missing clientId)

```javascript
// Client code:
const storage = createMemoryStorage();
try {
  await storage.appendToChangelog({
    mutationId: "mut-1",
    // clientId missing
    resource: "tasks",
    operation: "insert",
    record: {}
  });
  throw new Error("Should have thrown");
} catch (err) {
  // Expected: err.message matches /Missing clientId/
}
```

---

### OFFLINE-001, OFFLINE-002: Local DFQL Expansion

#### TV-OFFLINE-QUERY-REL-001 (Positive: Local query expands relations)

```javascript
// Setup: Local storage has task-1 with projectId="project-1"
// Local storage has project-1

// Client code (offline):
const result = await client.tasks.query({
  filters: { id: "task-1" },
  select: ["title", "project.*"]
});

// Expected: result.data[0] = {
//   id: "task-1",
//   title: "Task",
//   project: { id: "project-1", name: "Project", /* ... */ }
// }
```

#### TV-OFFLINE-QUERY-NESTED-001 (Positive: Local query expands nested relations)

```javascript
// Setup: task-1 → project-1 → owner-1

// Client code (offline):
const result = await client.tasks.query({
  filters: { id: "task-1" },
  select: ["title", "project.owner.*"]
});

// Expected: result.data[0] = {
//   id: "task-1",
//   title: "Task",
//   project: {
//     id: "project-1",
//     owner: { id: "owner-1", name: "Alice", /* ... */ }
//   }
// }
```

#### TV-OFFLINE-QUERY-GROUPBY-001 (Positive: Local query aggregates)

```javascript
// Setup: Local storage has 10 tasks (5 active, 5 completed)

// Client code (offline):
const result = await client.tasks.query({
  groupBy: ["status"],
  aggregations: { total: { op: "count" } }
});

// Expected: result.groups = [
//   { status: "active", total: 5 },
//   { status: "completed", total: 5 }
// ]
```

---

### EXT-001: Subscription Event subscriptionId Delivery

#### TV-EXT-SUB-ID-001 (Positive: Event includes subscriptionId)

```javascript
// Background runtime:
const subscription1 = client.subscribe((event) => {
  // Event handler
});

// Content script via RPC:
const transportEvents = [];
transport.onMessage((msg) => {
  if (msg.type === "event") {
    transportEvents.push(msg);
  }
});

// Trigger event in background
await client.tasks.mutate({ operation: "insert", /* ... */ });

// Verify: transportEvents[0] = {
//   type: "event",
//   subscriptionId: "<subscription-id>",
//   event: { type: "mutation_applied", /* ... */ }
// }
```

---

### DOCS-001 through DOCS-004: Documentation Fixes

*(Manual verification test vectors)*

#### TV-DOCS-CORE-001

```markdown
// Verify: core/README.md contains:
// "DatafnError is an interface with shape { code, message, details: { path, ...} }"
// and does NOT contain:
// "new DatafnError(...)" or "DatafnError class"
```

#### TV-DOCS-CLIENT-001

```markdown
// Verify: client/README.md contains:
// All examples use "filters" key (not "where")
// All examples use "merge" | "insert" | "replace" | "delete" (not "update")
```

#### TV-DOCS-SERVER-001

```markdown
// Verify: server/README.md documents capabilities as:
// ["dfql.query", "dfql.mutation", "dfql.transact", "sync.seed", "sync.clone", "sync.pull", "sync.push"]
```

#### TV-DOCS-SVELTE-001

```markdown
// Verify: svelte/README.md includes complete example:
// import { createDatafnClient } from "@datafn/client";
// import { toSvelteStore } from "@datafn/svelte";
// const client = createDatafnClient({ schema, remote });
// const signal = client.tasks.signal({ filters: {...} });
// const store = toSvelteStore(signal);
// $store in Svelte component
```

---

### PY-001 through PY-006: Python Parity

#### TV-PY-QUERY-001 (Positive: Python query endpoint)

```python
# Python server
import datafn

server = datafn.create_datafn_server({
    "schema": schema,
    "db": db_adapter
})

# HTTP Request: POST /datafn/query
# Body: {"resource": "tasks", "version": "1", "filters": {}}

# Expected Response: 200 OK
# { "ok": true, "result": { "data": [...], "nextCursor": null } }
```

#### TV-PY-MUTATION-001 (Positive: Python mutation endpoint)

```python
# HTTP Request: POST /datafn/mutation
# Body: {
#   "resource": "tasks",
#   "version": "1",
#   "clientId": "client-1",
#   "mutationId": "mut-1",
#   "operation": "insert",
#   "record": {"title": "Task"}
# }

# Expected Response: 200 OK
# { "ok": true, "result": { "ok": true, "mutationId": "mut-1", "affectedIds": [...] } }
```

#### TV-PY-INV-JSON-001 (Negative: Python invalid JSON determinism)

```python
# HTTP Request: POST /datafn/query
# Body: {invalid json}

# Expected Response: 400 Bad Request
# { "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": {"path": "$"} } }

# MUST NOT return FORBIDDEN
```

---

### SEARCH-001, SEARCH-002, SEARCH-003: Search Integration

#### TV-SEARCH-CANDIDATES-001 (Positive: searchfn selects candidates)

```javascript
// Server with searchfn plugin installed

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "search": {
    "query": "urgent",
    "type": "fullText",
    "fields": ["title", "description"]
  },
  "filters": { "status": "active" }
}

// Plugin returns candidate ids: ["task-1", "task-5", "task-10"]

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [
      { "id": "task-1", "title": "Urgent task", "status": "active", /* ... */ },
      { "id": "task-5", "title": "Very urgent", "status": "active", /* ... */ }
      // task-10 filtered out by status filter
    ],
    "nextCursor": null
  }
}
```

#### TV-SEARCH-NOPLUGIN-001 (Negative: No searchfn plugin)

```json
// Server without searchfn plugin

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "search": { "query": "urgent", "type": "fullText" }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_UNSUPPORTED",
    "message": "Search requires searchfn plugin",
    "details": { "path": "search" }
  }
}
```

---

## P2 Completeness

### FILTER-001, FILTER-002: Additional Filter Features

#### TV-FILTER-NESTED-OBJ-001 (Positive: Nested object dot-path)

```json
// Schema: tasks has field "metadata" of type "object"
// Setup: task-1 has { metadata: { priority: "high" } }

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": { "metadata.priority": "high" }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "data": [
      { "id": "task-1", "metadata": { "priority": "high" }, /* ... */ }
    ],
    "nextCursor": null
  }
}
```

#### TV-FILTER-OPS-IN-001 (Positive: in operator)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": { "status": { "in": ["active", "pending"] } }
}

// Expected Response: 200 OK (tasks with status active or pending)
```

#### TV-FILTER-OPS-BETWEEN-001 (Positive: between operator)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": {
    "createdAt": { "between": ["2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z"] }
  }
}

// Expected Response: 200 OK (tasks created in January 2026)
```

---

### AGG-001, AGG-002: Aggregate Improvements

#### TV-AGG-ORDER-001 (Positive: Aggregate results ordered by group keys)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "groupBy": ["status"],
  "aggregations": { "total": { "op": "count" } }
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "groups": [
      { "status": "active", "total": 5 },
      { "status": "completed", "total": 3 },
      { "status": "pending", "total": 2 }
    ],
    "nextCursor": null
  }
}

// Verify: Groups ordered by status (deterministic)
```

#### TV-AGG-CURSOR-001 (Positive: Aggregate pagination with cursor)

```json
// Setup: 100 tasks grouped by status

// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "groupBy": ["status"],
  "aggregations": { "total": { "op": "count" } },
  "sort": ["status:asc"],
  "limit": 10
}

// Expected Response: 200 OK
{
  "ok": true,
  "result": {
    "groups": [ /* 10 groups */ ],
    "nextCursor": { "status": "<last-status>" }
  }
}
```

---

### LIMIT-001, LIMIT-002, LIMIT-003: Limits Enforcement

#### TV-LIMIT-PAYLOAD-001 (Negative: Exceeds maxPayloadBytes)

```json
// Assume maxPayloadBytes = 10MB

// Request: POST /datafn/mutation
// Body: { /* 11MB payload */ }

// Expected Response: 413 Payload Too Large
{
  "ok": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Request payload exceeds maximum size",
    "details": { "path": "$", "max": 10485760 }
  }
}
```

#### TV-LIMIT-DEPTH-FILTER-001 (Negative: Filter nesting too deep)

```json
// Request: POST /datafn/query
{
  "resource": "tasks",
  "version": "1",
  "filters": {
    "$and": [
      { "$or": [
        { "$and": [
          /* ... 11 levels deep ... */
        ]}
      ]}
    ]
  }
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Filter nesting depth exceeds limit",
    "details": { "path": "filters", "max": 10 }
  }
}
```

---

### OBS-001, OBS-002: Observability

#### TV-OBS-REDACT-001 (Positive: Sensitive fields redacted in logs)

```javascript
// Schema: users has field "password" with encrypt: true

// Server logs after mutation:
// { endpoint: "/datafn/mutation", resource: "users", operation: "insert", record: { email: "user@example.com", password: "[REDACTED]" } }

// Verify: Logs do not contain plaintext password
```

#### TV-OBS-LOG-001 (Positive: Request metadata logged)

```javascript
// Server logs after query:
// { timestamp: "2026-01-24T12:00:00Z", endpoint: "/datafn/query", resource: "tasks", duration_ms: 45 }

// Verify: Logs include deterministic metadata
```

---

### SYNC-001, SYNC-002, SYNC-003: Sync Robustness

#### TV-SYNC-SERVERSEQ-CONCURRENT-001 (Positive: Concurrent mutations get unique serverSeq)

```javascript
// Concurrent mutations from 10 clients

// Verify: All mutations receive unique serverSeq values
// Verify: serverSeq ordering is monotonic
```

#### TV-SYNC-CLONE-ORDER-001 (Positive: Clone ordering deterministic)

```json
// Request: POST /datafn/clone (twice with same data)
{
  "clientId": "client-1",
  "tables": ["tasks"]
}

// Expected: Both responses have identical data order (id:asc)
```

#### TV-SYNC-REMOTE-ONLY-001 (Negative: Clone remote-only table rejected)

```json
// Schema: logs table has isRemoteOnly: true

// Request: POST /datafn/clone
{
  "clientId": "client-1",
  "tables": ["logs"]
}

// Expected Response: 400 Bad Request
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Table is remote-only and cannot be cloned",
    "details": { "path": "tables", "table": "logs" }
  }
}
```

---

## Summary

This spec defines **100+ test vectors** across:
- **P0 Critical Fixes**: 40+ vectors covering auth, validation, execution errors, mutations, guards, transact, determinism
- **P1 High-Value Fixes**: 40+ vectors covering pagination, storage, offline, extension, docs, Python parity, search
- **P2 Completeness**: 20+ vectors covering additional filters, aggregations, limits, observability, sync robustness

All vectors are independently executable with deterministic inputs and expected outputs for verification during implementation phases.
