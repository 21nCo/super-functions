## datafn — Test vectors (golden I/O)

All vectors are written to be **deterministic** and runnable in isolation.

Unless explicitly stated, vectors assume:
- JSON uses UTF-8.
- The server is configured with limits: `maxLimit = 2`, `maxTransactSteps = 2`, `maxPayloadBytes = 1048576`.
- Authorization allows all requests (unless the vector overrides).

---

## Shared fixtures

### Fixture F1 (schema + dataset)

Schema:

```json
{
  "resources": [
    {
      "name": "goal",
      "version": 1,
      "fields": [
        { "name": "label", "type": "string", "required": true },
        { "name": "status", "type": "string", "required": true },
        { "name": "isArchived", "type": "boolean", "required": true }
      ]
    },
    {
      "name": "task",
      "version": 1,
      "fields": [
        { "name": "label", "type": "string", "required": true },
        { "name": "priority", "type": "number", "required": true },
        { "name": "goalId", "type": "string", "required": true },
        { "name": "isArchived", "type": "boolean", "required": true },
        { "name": "updatedAt", "type": "string", "required": true }
      ],
      "indices": ["label"]
    },
    {
      "name": "tag",
      "version": 1,
      "fields": [{ "name": "label", "type": "string", "required": true }]
    }
  ],
  "relations": [
    {
      "from": "task",
      "to": "goal",
      "type": "many-one",
      "relation": "goal",
      "inverse": "tasks",
      "fkField": "goalId"
    },
    {
      "from": "task",
      "to": "tag",
      "type": "many-many",
      "relation": "tags",
      "inverse": "tasks",
      "metadata": [
        { "name": "order", "type": "number" },
        { "name": "addedAt", "type": "date" }
      ]
    }
  ]
}
```

Dataset snapshot:

```json
{
  "goal": [
    { "id": "goal:g1", "label": "Goal 1", "status": "open", "isArchived": false },
    { "id": "goal:g2", "label": "Goal 2", "status": "paused", "isArchived": false },
    { "id": "goal:g3", "label": "Goal 3", "status": "open", "isArchived": true }
  ],
  "task": [
    {
      "id": "task:t1",
      "label": "Task 1",
      "priority": 5,
      "goalId": "goal:g1",
      "isArchived": false,
      "updatedAt": "2026-01-10"
    },
    {
      "id": "task:t2",
      "label": "Task 2",
      "priority": 2,
      "goalId": "goal:g1",
      "isArchived": false,
      "updatedAt": "2026-01-11"
    },
    {
      "id": "task:t3",
      "label": "Task 3",
      "priority": 3,
      "goalId": "goal:g2",
      "isArchived": false,
      "updatedAt": "2026-01-12"
    },
    {
      "id": "task:t4",
      "label": "Task 4",
      "priority": 10,
      "goalId": "goal:g2",
      "isArchived": true,
      "updatedAt": "2026-01-13"
    }
  ],
  "tag": [
    { "id": "tag:urgent", "label": "urgent" },
    { "id": "tag:home", "label": "home" }
  ],
  "relations": {
    "task.tags": [
      { "from": "task:t1", "to": "tag:urgent", "order": 2, "addedAt": "2026-01-01" },
      { "from": "task:t1", "to": "tag:home", "order": 1, "addedAt": "2026-01-02" },
      { "from": "task:t3", "to": "tag:urgent", "order": 1, "addedAt": "2026-01-03" }
    ]
  }
}
```

---

## API / envelope

### TV-API-001

- **Vector ID**: TV-API-001
- **Description**: Successful endpoint response uses `DatafnEnvelope` with `ok:true` and a `result` payload.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": { "data": [{ "id": "goal:g1", "label": "Goal 1" }], "nextCursor": null }
}
```

- **Negative variant(s)**: N/A

### TV-API-002

- **Vector ID**: TV-API-002
- **Description**: Invalid DFQL request returns `ok:false` with deterministic `error.code` and `error.message`.
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": "hello" }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: expected object or array",
    "details": { "path": "$" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Schema validation

### TV-SCHEMA-001

- **Vector ID**: TV-SCHEMA-001
- **Description**: `validateSchema` accepts a valid schema and normalizes `indices: string[]` to `{ base, search, vector }`.
- **Input**:

```json
{
  "call": "@datafn/core.validateSchema",
  "args": [
    {
      "resources": [
        {
          "name": "task",
          "version": 1,
          "fields": [{ "name": "label", "type": "string", "required": true }],
          "indices": ["label"]
        }
      ]
    }
  ]
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "resources": [
      {
        "name": "task",
        "version": 1,
        "fields": [{ "name": "label", "type": "string", "required": true }],
        "indices": { "base": ["label"], "search": [], "vector": [] }
      }
    ]
  }
}
```

- **Negative variant(s)**: N/A

### TV-SCHEMA-002

- **Vector ID**: TV-SCHEMA-002
- **Description**: `validateSchema` rejects invalid schemas with `SCHEMA_INVALID`.
- **Input**:

```json
{ "call": "@datafn/core.validateSchema", "args": [{ "relations": [] }] }
```

- **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } }
}
```

- **Negative variant(s)**: N/A

---

## Query validation + semantics

### TV-QUERY-001

- **Vector ID**: TV-QUERY-001
- **Description**: Valid query with `many-one` relation expansion (`goal.*`) returns expected records.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": {
      "resource": "task",
      "version": 1,
      "select": ["id", "label", "goal.*"],
      "filters": { "isArchived": false },
      "sort": ["id:asc"]
    }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "data": [
      {
        "id": "task:t1",
        "label": "Task 1",
        "goal": { "id": "goal:g1", "label": "Goal 1", "status": "open", "isArchived": false }
      },
      {
        "id": "task:t2",
        "label": "Task 2",
        "goal": { "id": "goal:g1", "label": "Goal 1", "status": "open", "isArchived": false }
      },
      {
        "id": "task:t3",
        "label": "Task 3",
        "goal": { "id": "goal:g2", "label": "Goal 2", "status": "paused", "isArchived": false }
      }
    ],
    "nextCursor": null
  }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-002

- **Vector ID**: TV-QUERY-002
- **Description**: Unknown resource/field/relation are rejected with the appropriate error code.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "id": "task:t1" } }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [{ "id": "task:t1" }], "nextCursor": null } }
```

- **Negative variant(s)**:
  - **Unknown resource**:
    - **Input**:

```json
{ "fixture": "F1", "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "nope", "version": 1 } } }
```

    - **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "DFQL_UNKNOWN_RESOURCE", "message": "Unknown resource: nope", "details": { "path": "resource" } }
}
```

  - **Unknown field**:
    - **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "filters": { "notAField": true } } }
}
```

    - **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_UNKNOWN_FIELD",
    "message": "Unknown field: filters.notAField",
    "details": { "path": "filters.notAField" }
  }
}
```

  - **Unknown relation**:
    - **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "nope.*"] } }
}
```

    - **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "DFQL_UNKNOWN_RELATION", "message": "Unknown relation: select[1]", "details": { "path": "select[1]" } }
}
```

### TV-QUERY-003

- **Vector ID**: TV-QUERY-003
- **Description**: When `sort` is omitted, ordering is deterministic by default (`id:asc`).
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "isArchived": false } }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": { "data": [{ "id": "task:t1" }, { "id": "task:t2" }, { "id": "task:t3" }], "nextCursor": null }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-004

- **Vector ID**: TV-QUERY-004
- **Description**: Cursor pagination requires `sort` with `id` as the final tie-breaker; otherwise the query is rejected.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": {
      "resource": "task",
      "version": 1,
      "select": ["id"],
      "filters": { "isArchived": false },
      "sort": ["updatedAt:desc"],
      "limit": 2,
      "cursor": { "after": { "updatedAt": "2026-01-11", "id": "task:t2" } }
    }
  }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: cursor requires sort with id tie-breaker",
    "details": { "path": "sort" }
  }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-005

- **Vector ID**: TV-QUERY-005
- **Description**: Filters support operator objects and `$and`/`$or` groups.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": {
      "resource": "task",
      "version": 1,
      "select": ["id"],
      "filters": {
        "$and": [
          { "isArchived": false },
          { "$or": [{ "priority": { "gte": 5 } }, { "goalId": { "eq": "goal:g2" } }] }
        ]
      },
      "sort": ["id:asc"]
    }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [{ "id": "task:t1" }, { "id": "task:t3" }], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-QUERY-006

- **Vector ID**: TV-QUERY-006
- **Description**: Unsupported operators are rejected with `DFQL_UNSUPPORTED`.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "label": { "contains": "Task" } } }
  }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_UNSUPPORTED",
    "message": "Unsupported DFQL feature: operator.contains",
    "details": { "path": "filters.label.contains" }
  }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-007

- **Vector ID**: TV-QUERY-007
- **Description**: `select` token semantics: omitted `select` returns all schema fields; `many-many` supports `relation.#` and `relation.*#` with deterministic ordering by `order` metadata.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": [
      { "resource": "goal", "version": 1, "filters": { "id": "goal:g1" } },
      { "resource": "task", "version": 1, "select": ["id", "tags.#"], "filters": { "id": "task:t1" } },
      { "resource": "task", "version": 1, "select": ["id", "tags.*#"], "filters": { "id": "task:t1" } }
    ]
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": [
    {
      "data": [{ "id": "goal:g1", "label": "Goal 1", "status": "open", "isArchived": false }],
      "nextCursor": null
    },
    {
      "data": [
        {
          "id": "task:t1",
          "tags": [
            { "from": "task:t1", "to": "tag:home", "order": 1, "addedAt": "2026-01-02" },
            { "from": "task:t1", "to": "tag:urgent", "order": 2, "addedAt": "2026-01-01" }
          ]
        }
      ],
      "nextCursor": null
    },
    {
      "data": [
        {
          "id": "task:t1",
          "tags": [
            { "id": "tag:home", "label": "home", "$relation_metadata": { "order": 1, "addedAt": "2026-01-02" } },
            { "id": "tag:urgent", "label": "urgent", "$relation_metadata": { "order": 2, "addedAt": "2026-01-01" } }
          ]
        }
      ],
      "nextCursor": null
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-008

- **Vector ID**: TV-QUERY-008
- **Description**: Invalid select tokens are rejected (unknown relation token).
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "nope.*"] } }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "DFQL_UNKNOWN_RELATION", "message": "Unknown relation: select[1]", "details": { "path": "select[1]" } }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-009

- **Vector ID**: TV-QUERY-009
- **Description**: Pagination supports `limit`/`offset` and cursor pagination with `cursor.after`.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": [
      {
        "resource": "task",
        "version": 1,
        "select": ["id"],
        "filters": { "isArchived": false },
        "sort": ["updatedAt:desc", "id:asc"],
        "limit": 2,
        "offset": 0
      },
      {
        "resource": "task",
        "version": 1,
        "select": ["id"],
        "filters": { "isArchived": false },
        "sort": ["updatedAt:desc", "id:asc"],
        "limit": 2,
        "cursor": { "after": { "updatedAt": "2026-01-11", "id": "task:t2" } }
      }
    ]
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": [
    { "data": [{ "id": "task:t3" }, { "id": "task:t2" }], "nextCursor": null },
    { "data": [{ "id": "task:t1" }], "nextCursor": null }
  ]
}
```

- **Negative variant(s)**: N/A

---

## Mutations (records + relations)

### TV-MUT-001

- **Vector ID**: TV-MUT-001
- **Description**: Record CRUD mutations (`insert`, `merge`, `replace`, `delete`) apply and can be verified via query.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "insert",
        "clientId": "client:device-1",
        "mutationId": "m-ins-1",
        "id": "tag:new",
        "record": { "label": "new" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "tag", "version": 1, "select": ["id", "label"], "filters": { "id": "tag:new" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "merge",
        "clientId": "client:device-1",
        "mutationId": "m-merge-1",
        "id": "tag:new",
        "record": { "label": "newer" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "tag", "version": 1, "select": ["id", "label"], "filters": { "id": "tag:new" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "replace",
        "clientId": "client:device-1",
        "mutationId": "m-replace-1",
        "id": "tag:new",
        "record": { "label": "replaced" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "tag", "version": 1, "select": ["id", "label"], "filters": { "id": "tag:new" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "delete",
        "clientId": "client:device-1",
        "mutationId": "m-del-1",
        "id": "tag:new"
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "tag", "version": 1, "select": ["id"], "filters": { "id": "tag:new" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-ins-1", "affectedIds": ["tag:new"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "tag:new", "label": "new" }], "nextCursor": null } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-merge-1", "affectedIds": ["tag:new"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "tag:new", "label": "newer" }], "nextCursor": null } },
    {
      "ok": true,
      "result": { "ok": true, "mutationId": "m-replace-1", "affectedIds": ["tag:new"], "errors": [], "deduped": false }
    },
    { "ok": true, "result": { "data": [{ "id": "tag:new", "label": "replaced" }], "nextCursor": null } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-del-1", "affectedIds": ["tag:new"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-002

- **Vector ID**: TV-MUT-002
- **Description**: Unsupported mutation operations are rejected as per-item errors and do not change state.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "upsert",
        "clientId": "client:device-1",
        "mutationId": "m-bad-op-1",
        "id": "tag:urgent",
        "record": { "label": "should-not-apply" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "tag", "version": 1, "select": ["id", "label"], "filters": { "id": "tag:urgent" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    {
      "ok": true,
      "result": {
        "ok": false,
        "mutationId": "m-bad-op-1",
        "affectedIds": [],
        "errors": [
          {
            "code": "DFQL_UNSUPPORTED",
            "message": "Unsupported DFQL feature: mutation.operation.upsert",
            "path": "operation",
            "retryable": false
          }
        ],
        "deduped": false
      }
    },
    { "ok": true, "result": { "data": [{ "id": "tag:urgent", "label": "urgent" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-003

- **Vector ID**: TV-MUT-003
- **Description**: Replaying the same `(clientId, mutationId)` is deduped (`deduped:true`) and does not re-apply.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "goal",
        "version": 1,
        "operation": "merge",
        "clientId": "client:device-1",
        "mutationId": "m-idem-1",
        "id": "goal:g1",
        "record": { "label": "Goal 1 Updated" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "goal",
        "version": 1,
        "operation": "merge",
        "clientId": "client:device-1",
        "mutationId": "m-idem-1",
        "id": "goal:g1",
        "record": { "label": "Goal 1 Updated" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-idem-1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-idem-1", "affectedIds": ["goal:g1"], "errors": [], "deduped": true } },
    { "ok": true, "result": { "data": [{ "id": "goal:g1", "label": "Goal 1 Updated" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-004

- **Vector ID**: TV-MUT-004
- **Description**: Missing `clientId` or `mutationId` yields a per-mutation `DFQL_INVALID` error.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/mutation",
    "body": { "resource": "goal", "version": 1, "operation": "merge", "id": "goal:g1", "record": { "label": "X" } }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": false,
    "affectedIds": [],
    "errors": [{ "code": "DFQL_INVALID", "message": "Invalid DFQL: clientId and mutationId are required", "path": "$" }],
    "deduped": false
  }
}
```

- **Negative variant(s)**: N/A

### TV-MUT-005

- **Vector ID**: TV-MUT-005
- **Description**: `if` guard match applies the mutation.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:device-1",
        "mutationId": "m-if-1",
        "id": "task:t1",
        "if": { "updatedAt": { "eq": "2026-01-10" } },
        "record": { "label": "Task 1 Updated" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "label"], "filters": { "id": "task:t1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-if-1", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t1", "label": "Task 1 Updated" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-006

- **Vector ID**: TV-MUT-006
- **Description**: `if` guard mismatch fails with `CONFLICT` and does not apply.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:device-1",
        "mutationId": "m-if-2",
        "id": "task:t1",
        "if": { "updatedAt": { "eq": "WRONG" } },
        "record": { "label": "Should Not Apply" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "label"], "filters": { "id": "task:t1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    {
      "ok": true,
      "result": {
        "ok": false,
        "mutationId": "m-if-2",
        "affectedIds": [],
        "errors": [{ "code": "CONFLICT", "message": "Conflict", "path": "if" }],
        "deduped": false
      }
    },
    { "ok": true, "result": { "data": [{ "id": "task:t1", "label": "Task 1" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-007

- **Vector ID**: TV-MUT-007
- **Description**: Relation mutations (`relate`, `modifyRelation`, `unrelate`) apply and are visible via `relation.#`.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "relate",
        "clientId": "client:device-1",
        "mutationId": "m-rel-1",
        "id": "task:t2",
        "relations": { "tags": { "$ref": "tag:urgent", "order": 1, "addedAt": "2026-01-18" } }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "tags.#"], "filters": { "id": "task:t2" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "modifyRelation",
        "clientId": "client:device-1",
        "mutationId": "m-rel-2",
        "id": "task:t2",
        "relations": { "tags": { "$ref": "tag:urgent", "order": 5 } }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "tags.#"], "filters": { "id": "task:t2" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "unrelate",
        "clientId": "client:device-1",
        "mutationId": "m-rel-3",
        "id": "task:t2",
        "relations": { "tags": "tag:urgent" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "tags.#"], "filters": { "id": "task:t2" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-rel-1", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t2", "tags": [{ "from": "task:t2", "to": "tag:urgent", "order": 1, "addedAt": "2026-01-18" }] }], "nextCursor": null } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-rel-2", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t2", "tags": [{ "from": "task:t2", "to": "tag:urgent", "order": 5, "addedAt": "2026-01-18" }] }], "nextCursor": null } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-rel-3", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t2", "tags": [] }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-008

- **Vector ID**: TV-MUT-008
- **Description**: Unknown relation metadata fields are rejected with `DFQL_INVALID` and do not apply.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "relate",
        "clientId": "client:device-1",
        "mutationId": "m-rel-bad-1",
        "id": "task:t2",
        "relations": { "tags": { "$ref": "tag:urgent", "priority": 1 } }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "tags.#"], "filters": { "id": "task:t2" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    {
      "ok": true,
      "result": {
        "ok": false,
        "mutationId": "m-rel-bad-1",
        "affectedIds": [],
        "errors": [{ "code": "DFQL_INVALID", "message": "Invalid DFQL: unknown relation metadata field tags.priority", "path": "relations.tags.priority" }],
        "deduped": false
      }
    },
    { "ok": true, "result": { "data": [{ "id": "task:t2", "tags": [] }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

---

## Transactions

### TV-TX-001

- **Vector ID**: TV-TX-001
- **Description**: `transact` executes steps in order and commits atomically when all steps succeed.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/transact",
      "body": {
        "transactionId": "tx-1",
        "atomic": true,
        "steps": [
          { "query": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } } },
          {
            "mutation": {
              "resource": "goal",
              "version": 1,
              "operation": "merge",
              "clientId": "client:device-1",
              "mutationId": "m-tx-1",
              "id": "goal:g1",
              "record": { "label": "Goal 1 tx" }
            }
          }
        ]
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    {
      "ok": true,
      "result": {
        "ok": true,
        "results": [
          { "kind": "query", "ok": true, "result": { "data": [{ "id": "goal:g1", "label": "Goal 1" }], "nextCursor": null } },
          {
            "kind": "mutation",
            "ok": true,
            "result": { "ok": true, "mutationId": "m-tx-1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false }
          }
        ]
      }
    },
    { "ok": true, "result": { "data": [{ "id": "goal:g1", "label": "Goal 1 tx" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-TX-002

- **Vector ID**: TV-TX-002
- **Description**: When `atomic:true` and a step fails, the transaction stops at the failure and no mutation effects are persisted.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/transact",
      "body": {
        "transactionId": "tx-2",
        "atomic": true,
        "steps": [
          {
            "mutation": {
              "resource": "goal",
              "version": 1,
              "operation": "merge",
              "clientId": "client:device-1",
              "mutationId": "m-tx-bad-1",
              "id": "goal:g1",
              "if": { "label": { "eq": "Not Goal 1" } },
              "record": { "label": "Should Not Apply" }
            }
          },
          {
            "mutation": {
              "resource": "goal",
              "version": 1,
              "operation": "merge",
              "clientId": "client:device-1",
              "mutationId": "m-tx-bad-2",
              "id": "goal:g2",
              "record": { "label": "Also Should Not Apply" }
            }
          }
        ]
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g2" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    {
      "ok": true,
      "result": {
        "ok": false,
        "results": [
          {
            "kind": "mutation",
            "ok": false,
            "result": {
              "ok": false,
              "mutationId": "m-tx-bad-1",
              "affectedIds": [],
              "errors": [{ "code": "CONFLICT", "message": "Conflict", "path": "if" }],
              "deduped": false
            }
          }
        ]
      }
    },
    { "ok": true, "result": { "data": [{ "id": "goal:g1", "label": "Goal 1" }], "nextCursor": null } },
    { "ok": true, "result": { "data": [{ "id": "goal:g2", "label": "Goal 2" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

---

## Normalization / cache keys

### TV-NORM-001

- **Vector ID**: TV-NORM-001
- **Description**: Semantically equivalent DFQL objects normalize to the same canonical JSON and `dfqlKey`.
- **Input**:

```json
{
  "calls": [
    {
      "call": "@datafn/core.dfqlKey",
      "args": [{ "version": 1, "resource": "task", "filters": { "id": "task:t1", "isArchived": false }, "select": ["id", "label"] }]
    },
    {
      "call": "@datafn/core.dfqlKey",
      "args": [{ "select": ["id", "label"], "filters": { "isArchived": false, "id": "task:t1" }, "resource": "task", "version": 1 }]
    }
  ]
}
```

- **Expected output**:

```json
{
  "results": [
    "{\"filters\":{\"id\":\"task:t1\",\"isArchived\":false},\"resource\":\"task\",\"select\":[\"id\",\"label\"],\"version\":1}",
    "{\"filters\":{\"id\":\"task:t1\",\"isArchived\":false},\"resource\":\"task\",\"select\":[\"id\",\"label\"],\"version\":1}"
  ]
}
```

- **Negative variant(s)**: N/A

### TV-NORM-002

- **Vector ID**: TV-NORM-002
- **Description**: Non-equivalent DFQL objects produce different `dfqlKey` values.
- **Input**:

```json
{
  "calls": [
    { "call": "@datafn/core.dfqlKey", "args": [{ "resource": "task", "version": 1, "select": ["id"], "filters": { "id": "task:t1" } }] },
    { "call": "@datafn/core.dfqlKey", "args": [{ "resource": "task", "version": 1, "select": ["id", "label"], "filters": { "id": "task:t1" } }] }
  ]
}
```

- **Expected output**:

```json
{
  "results": [
    "{\"filters\":{\"id\":\"task:t1\"},\"resource\":\"task\",\"select\":[\"id\"],\"version\":1}",
    "{\"filters\":{\"id\":\"task:t1\"},\"resource\":\"task\",\"select\":[\"id\",\"label\"],\"version\":1}"
  ]
}
```

- **Negative variant(s)**: N/A

---

## Client events

### TV-EVENTS-001

- **Vector ID**: TV-EVENTS-001
- **Description**: Applied mutations emit a `mutation_applied` event that can be observed via `subscribe`.
- **Input**:

```json
{
  "fixture": "F1",
  "harness": { "fakeTimeMs": 0 },
  "steps": [
    { "op": "subscribe", "filter": { "type": "mutation_applied", "resource": "tag" } },
    {
      "op": "mutate",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "insert",
        "clientId": "client:device-1",
        "mutationId": "m-ev-1",
        "id": "tag:new",
        "record": { "label": "new" }
      }
    }
  ]
}
```

- **Expected output**:

```json
{
  "observedEvents": [
    {
      "type": "mutation_applied",
      "resource": "tag",
      "ids": ["tag:new"],
      "mutationId": "m-ev-1",
      "clientId": "client:device-1",
      "timestampMs": 0
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-EVENTS-002

- **Vector ID**: TV-EVENTS-002
- **Description**: Filters are deterministic; events that do not match the filter are not delivered.
- **Input**:

```json
{
  "fixture": "F1",
  "harness": { "fakeTimeMs": 0 },
  "steps": [
    { "op": "subscribe", "filter": { "type": "mutation_applied", "resource": "goal" } },
    {
      "op": "mutate",
      "body": {
        "resource": "tag",
        "version": 1,
        "operation": "insert",
        "clientId": "client:device-1",
        "mutationId": "m-ev-2",
        "id": "tag:new",
        "record": { "label": "new" }
      }
    }
  ]
}
```

- **Expected output**:

```json
{ "observedEvents": [] }
```

- **Negative variant(s)**: N/A

---

## Sync

### TV-SYNC-001

- **Vector ID**: TV-SYNC-001
- **Description**: `clone` returns requested tables’ data and cursors with deterministic record ordering (`id:asc`).
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:device-1", "tables": ["goal", "task"] } }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "data": {
      "goal": [
        { "id": "goal:g1", "label": "Goal 1", "status": "open", "isArchived": false },
        { "id": "goal:g2", "label": "Goal 2", "status": "paused", "isArchived": false },
        { "id": "goal:g3", "label": "Goal 3", "status": "open", "isArchived": true }
      ],
      "task": [
        { "id": "task:t1", "label": "Task 1", "priority": 5, "goalId": "goal:g1", "isArchived": false, "updatedAt": "2026-01-10" },
        { "id": "task:t2", "label": "Task 2", "priority": 2, "goalId": "goal:g1", "isArchived": false, "updatedAt": "2026-01-11" },
        { "id": "task:t3", "label": "Task 3", "priority": 3, "goalId": "goal:g2", "isArchived": false, "updatedAt": "2026-01-12" },
        { "id": "task:t4", "label": "Task 4", "priority": 10, "goalId": "goal:g2", "isArchived": true, "updatedAt": "2026-01-13" }
      ]
    },
    "cursors": { "goal": "0", "task": "0" }
  }
}
```

- **Negative variant(s)**: N/A

### TV-SYNC-002

- **Vector ID**: TV-SYNC-002
- **Description**: `clone` rejects tables marked `isRemoteOnly:true`.
- **Input**:

```json
{
  "fixture": "F1",
  "schemaOverride": {
    "resources": [
      { "name": "secret", "version": 1, "isRemoteOnly": true, "fields": [{ "name": "value", "type": "string", "required": true }] }
    ]
  },
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:device-1", "tables": ["secret"] } }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: remote-only table cannot be cloned: secret",
    "details": { "path": "tables[0]" }
  }
}
```

- **Negative variant(s)**: N/A

### TV-SYNC-003

- **Vector ID**: TV-SYNC-003
- **Description**: `pull` returns `records`, `deleted`, and monotonic per-table cursor updates.
- **Input**:

```json
{
  "fixture": "F1",
  "serverStateOverride": {
    "cursors": { "goal": "1" },
    "changesSince": {
      "goal:0": { "records": [{ "id": "goal:g4", "label": "Goal 4", "status": "open", "isArchived": false }], "deleted": [] }
    }
  },
  "request": { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:device-1", "cursors": { "goal": "0", "task": "0" } } }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "records": { "goal": [{ "id": "goal:g4", "label": "Goal 4", "status": "open", "isArchived": false }], "task": [] },
    "deleted": { "goal": [], "task": [] },
    "cursors": { "goal": "1", "task": "0" }
  }
}
```

- **Negative variant(s)**: N/A

### TV-SYNC-004

- **Vector ID**: TV-SYNC-004
- **Description**: `pull` rejects invalid cursor values (non-integer strings).
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:device-1", "cursors": { "goal": "abc" } } }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: cursor must be an integer string", "details": { "path": "cursors.goal" } }
}
```

- **Negative variant(s)**: N/A

### TV-SYNC-005

- **Vector ID**: TV-SYNC-005
- **Description**: `push` is idempotent on `(clientId, mutationId)` and returns `applied` and `errors`.
- **Input**:

```json
{
  "fixture": "F1",
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/push",
      "body": {
        "clientId": "client:device-1",
        "mutations": [
          {
            "resource": "goal",
            "version": 1,
            "operation": "merge",
            "clientId": "client:device-1",
            "mutationId": "m-push-1",
            "id": "goal:g1",
            "record": { "label": "Goal 1 Push" }
          }
        ]
      }
    },
    {
      "method": "POST",
      "path": "/datafn/push",
      "body": {
        "clientId": "client:device-1",
        "mutations": [
          {
            "resource": "goal",
            "version": 1,
            "operation": "merge",
            "clientId": "client:device-1",
            "mutationId": "m-push-1",
            "id": "goal:g1",
            "record": { "label": "Goal 1 Push" }
          }
        ]
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "label"], "filters": { "id": "goal:g1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "applied": ["m-push-1"], "errors": [] } },
    { "ok": true, "result": { "ok": true, "applied": ["m-push-1"], "errors": [] } },
    { "ok": true, "result": { "data": [{ "id": "goal:g1", "label": "Goal 1 Push" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SYNC-006

- **Vector ID**: TV-SYNC-006
- **Description**: `push` returns per-mutation errors for rejected mutations.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/push",
    "body": {
      "clientId": "client:device-1",
      "mutations": [
        { "resource": "goal", "version": 1, "operation": "merge", "id": "goal:g1", "record": { "label": "X" } }
      ]
    }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "applied": [],
    "errors": [{ "mutationId": null, "code": "DFQL_INVALID", "message": "Invalid DFQL: clientId and mutationId are required", "path": "$" }]
  }
}
```

- **Negative variant(s)**: N/A

---

## Security

### TV-SEC-001

- **Vector ID**: TV-SEC-001
- **Description**: When `authorize` allows, the request succeeds.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "authorizeDecision": "allow" },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["id"], "filters": { "id": "goal:g1" } } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [{ "id": "goal:g1" }], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-SEC-002

- **Vector ID**: TV-SEC-002
- **Description**: When `authorize` denies, the request is rejected with `FORBIDDEN` and no side effects occur.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "authorizeDecision": "deny" },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["id"], "filters": { "id": "goal:g1" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

---

## Limits

### TV-LIMIT-001

- **Vector ID**: TV-LIMIT-001
- **Description**: Queries at or under the configured `maxLimit` succeed.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "limits": { "maxLimit": 2 } },
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "isArchived": false }, "sort": ["updatedAt:desc", "id:asc"], "limit": 2 }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [{ "id": "task:t3" }, { "id": "task:t2" }], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-LIMIT-002

- **Vector ID**: TV-LIMIT-002
- **Description**: Transact requests exceeding `maxTransactSteps` are rejected with `LIMIT_EXCEEDED`.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "limits": { "maxTransactSteps": 2 } },
  "request": {
    "method": "POST",
    "path": "/datafn/transact",
    "body": { "transactionId": "tx-limit", "atomic": true, "steps": [{ "query": { "resource": "goal", "version": 1 } }, { "query": { "resource": "goal", "version": 1 } }, { "query": { "resource": "goal", "version": 1 } }] }
  }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "LIMIT_EXCEEDED", "message": "Limit exceeded: transact.steps>2", "details": { "path": "steps" } }
}
```

- **Negative variant(s)**: N/A

---

## Non-MVP (SHOULD) vectors

### TV-GROUP-001

- **Vector ID**: TV-GROUP-001
- **Description**: Group-by aggregations return grouped rows.
- **Input**:

```json
{
  "fixture": "F1",
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": {
      "resource": "goal",
      "version": 1,
      "filters": { "isArchived": false },
      "groupBy": ["status"],
      "aggregations": { "count": { "op": "count" } },
      "sort": ["status:asc"]
    }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "groups": [{ "status": "open", "count": 1 }, { "status": "paused", "count": 1 }], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-GROUP-002

- **Vector ID**: TV-GROUP-002
- **Description**: Relation expansion with `groupBy` is rejected (Undefined/unsupported).
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "groupBy": ["goalId"], "select": ["goal.*"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: groupBy.withRelations", "details": { "path": "select" } } }
```

- **Negative variant(s)**: N/A

### TV-SEARCH-001

- **Vector ID**: TV-SEARCH-001
- **Description**: When a `searchfn` plugin is installed, `search` returns candidates and DFQL filters apply deterministically.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "searchfnCandidates": ["task:t2", "task:t4", "task:t1"] },
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": {
      "resource": "task",
      "version": 1,
      "select": ["id"],
      "search": { "query": "task", "type": "fullText", "fields": ["label"] },
      "filters": { "isArchived": false },
      "sort": ["id:asc"]
    }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [{ "id": "task:t1" }, { "id": "task:t2" }], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-SEARCH-002

- **Vector ID**: TV-SEARCH-002
- **Description**: Search blocks are rejected when no search plugin/capability is available.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "searchfnInstalled": false },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "search": { "query": "x", "type": "fullText" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: search", "details": { "path": "search" } } }
```

- **Negative variant(s)**: N/A

### TV-PLUG-001

- **Vector ID**: TV-PLUG-001
- **Description**: Plugins execute hooks in registration order.
- **Input**:

```json
{
  "fixture": "F1",
  "server": {
    "plugins": [
      { "name": "p1", "beforeQuery": "record('p1.beforeQuery')", "afterQuery": "record('p1.afterQuery')" },
      { "name": "p2", "beforeQuery": "record('p2.beforeQuery')", "afterQuery": "record('p2.afterQuery')" }
    ]
  },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["id"], "filters": { "id": "goal:g1" } } }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": { "data": [{ "id": "goal:g1" }], "nextCursor": null },
  "observability": { "hookOrder": ["p1.beforeQuery", "p2.beforeQuery", "p1.afterQuery", "p2.afterQuery"] }
}
```

- **Negative variant(s)**: N/A

### TV-PLUG-002

- **Vector ID**: TV-PLUG-002
- **Description**: Fail-closed hooks (e.g. authz/validation) cause the request to fail.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "plugins": [{ "name": "authz", "beforeQuery": "throw FORBIDDEN" }] },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["id"], "filters": { "id": "goal:g1" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-COMP-001

- **Vector ID**: TV-COMP-001
- **Description**: `/datafn/status` exposes capability metadata (with deterministic `serverTimeMs` under a fake clock).
- **Input**:

```json
{
  "fixture": "F1",
  "harness": { "fakeTimeMs": 0 },
  "request": { "method": "GET", "path": "/datafn/status" }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "schemaHash": "sha256:8810b3bb4ba5721f202b967aeb2596cf90ed413555c1cb1b94c32e2b2733e5de",
    "capabilities": ["dfql.query", "dfql.mutation", "sync.clone", "sync.pull", "sync.push"],
    "limits": { "maxLimit": 2, "maxTransactSteps": 2, "maxPayloadBytes": 1048576 },
    "serverTimeMs": 0
  }
}
```

- **Negative variant(s)**: N/A

### TV-COMP-002

- **Vector ID**: TV-COMP-002
- **Description**: `/datafn/status` rejects when schema cannot be loaded/validated.
- **Input**:

```json
{
  "fixture": "F1",
  "server": { "schemaOverride": { "relations": [] } },
  "request": { "method": "GET", "path": "/datafn/status" }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } } }
```

- **Negative variant(s)**: N/A

### TV-OBS-001

- **Vector ID**: TV-OBS-001
- **Description**: Logs exclude values for fields marked `encrypt:true`.
- **Input**:

```json
{
  "server": {
    "schemaOverride": {
      "resources": [
        { "name": "secret", "version": 1, "fields": [{ "name": "value", "type": "string", "required": true, "encrypt": true }] }
      ]
    }
  },
  "request": {
    "method": "POST",
    "path": "/datafn/mutation",
    "body": {
      "resource": "secret",
      "version": 1,
      "operation": "insert",
      "clientId": "client:device-1",
      "mutationId": "m-log-1",
      "id": "secret:s1",
      "record": { "value": "TOP-SECRET" }
    }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": { "ok": true, "mutationId": "m-log-1", "affectedIds": ["secret:s1"], "errors": [], "deduped": false },
  "observability": {
    "logLines": [
      "datafn.mutation resource=secret operation=insert id=secret:s1 fields={\"value\":\"[REDACTED]\"}"
    ]
  }
}
```

- **Negative variant(s)**: N/A

### TV-OBS-002

- **Vector ID**: TV-OBS-002
- **Description**: Logs include deterministic request metadata (resource + operation + ids) but no stack traces in normal errors.
- **Input**:

```json
{
  "fixture": "F1",
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "nope", "version": 1 } }
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": { "code": "DFQL_UNKNOWN_RESOURCE", "message": "Unknown resource: nope", "details": { "path": "resource" } },
  "observability": { "logLines": ["datafn.query error=DFQL_UNKNOWN_RESOURCE resource=nope"] }
}
```

- **Negative variant(s)**: N/A

