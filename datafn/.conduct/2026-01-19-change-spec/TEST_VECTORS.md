## datafn — Change Spec Test Vectors (golden I/O)

These vectors define deterministic expectations for client ergonomics, server envelopes/sync/auth, plugins, DFQL completeness, offline persistence/hydration, extension RPC, and tooling.

### Harness conventions (used by all vectors)

- **Time**: `nowMs` is provided and the client uses `getTimestamp: () => nowMs`.
- **Remote stub**:
  - Each method records its call arguments in `remote.calls`.
  - Each method returns the next queued response for that method.
  - If a method is missing, it is treated as a transport error.
- **Event capture**: subscribing to `client.subscribe` appends events to `observed.events` in delivery order.
- **Server harness**:
  - `server.schema` defaults to the schema fixture at the top of this file; it MAY also be a string key naming a fixture (e.g. `"dfql"`).
  - `server.db` uses a `@superfunctions/db` adapter (memory adapter in vectors).
  - `request.body` is serialized as JSON; `request.rawBody` is sent verbatim (for invalid JSON vectors).
  - For `requests: [...]`, responses are collected in order.
- **Named stubs**:
  - `authorize: "denyIfPayloadNull"` denies only if payload is `null`.
  - `authorize: "denyAll"` denies every request.

Unless otherwise specified, schema is:

```json
{
  "resources": [
    { "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] },
    { "name": "goal", "version": 1, "fields": [{ "name": "label", "type": "string", "required": true }] }
  ],
  "relations": []
}
```

---

## Client creation / schema validation

### TV-CLIENT-001

- **Vector ID**: TV-CLIENT-001
- **Description**: Creating a client with a valid schema succeeds.
- **Input**:

```json
{
  "nowMs": 0,
  "op": "createClient",
  "config": {
    "schema": {
      "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] }]
    },
    "remote": { "query": "stub", "mutation": "stub", "transact": "stub", "seed": "stub", "clone": "stub", "pull": "stub", "push": "stub" },
    "getTimestamp": "nowMs"
  }
}
```

- **Expected output**:

```json
{ "ok": true }
```

- **Negative variant(s)**: N/A

### TV-CLIENT-002

- **Vector ID**: TV-CLIENT-002
- **Description**: Invalid schema is rejected with `SCHEMA_INVALID`.
- **Input**:

```json
{
  "nowMs": 0,
  "op": "createClient",
  "config": { "schema": { "relations": [] }, "remote": { "query": "stub", "mutation": "stub", "transact": "stub", "seed": "stub", "clone": "stub", "pull": "stub", "push": "stub" } }
}
```

- **Expected output**:

```json
{
  "throws": {
    "code": "SCHEMA_INVALID",
    "message": "Invalid schema: missing resources",
    "details": { "path": "resources" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Table registry

### TV-REG-001

- **Vector ID**: TV-REG-001
- **Description**: `client.table(name)` and `client.<tableName>` return the same table handle with deterministic `name` and `version`.
- **Input**:

```json
{
  "nowMs": 0,
  "ops": [
    { "op": "createClient", "schema": "default", "remote": "stub" },
    { "op": "getTable", "via": "table", "name": "task" },
    { "op": "getTable", "via": "property", "name": "task" }
  ]
}
```

- **Expected output**:

```json
{
  "table": { "name": "task", "version": 1 },
  "sameObjectIdentity": true
}
```

- **Negative variant(s)**: N/A

### TV-REG-002

- **Vector ID**: TV-REG-002
- **Description**: Table handle methods exist (`query`, `mutate`, `signal`, `subscribe`) as functions.
- **Input**:

```json
{ "nowMs": 0, "ops": [{ "op": "createClient", "schema": "default", "remote": "stub" }, { "op": "getTable", "via": "property", "name": "task" }] }
```

- **Expected output**:

```json
{ "has": ["query", "mutate", "signal", "subscribe"], "allAreFunctions": true }
```

- **Negative variant(s)**: N/A

### TV-REG-003

- **Vector ID**: TV-REG-003
- **Description**: Unknown table access is rejected deterministically.
- **Input**:

```json
{ "nowMs": 0, "ops": [{ "op": "createClient", "schema": "default", "remote": "stub" }, { "op": "getTable", "via": "table", "name": "nope" }] }
```

- **Expected output**:

```json
{
  "throws": {
    "code": "DFQL_UNKNOWN_RESOURCE",
    "message": "Unknown resource: nope",
    "details": { "path": "resource", "resource": "nope" }
  }
}
```

- **Negative variant(s)**:
  - **Via property access**:
    - **Input**:

```json
{ "nowMs": 0, "ops": [{ "op": "createClient", "schema": "default", "remote": "stub" }, { "op": "getTable", "via": "property", "name": "nope" }] }
```

    - **Expected output**:

```json
{
  "throws": {
    "code": "DFQL_UNKNOWN_RESOURCE",
    "message": "Unknown resource: nope",
    "details": { "path": "resource", "resource": "nope" }
  }
}
```

### TV-REG-004

- **Vector ID**: TV-REG-004
- **Description**: Reserved keys do not throw (Proxy safety).
- **Input**:

```json
{ "nowMs": 0, "ops": [{ "op": "createClient", "schema": "default", "remote": "stub" }, { "op": "getProperty", "name": "then" }, { "op": "getProperty", "name": "toJSON" }, { "op": "getProperty", "name": "inspect" }] }
```

- **Expected output**:

```json
{ "values": { "then": null, "toJSON": null, "inspect": null } }
```

- **Negative variant(s)**: N/A

Notes:
- `null` here means “not a table handle and not throwing”; concrete returned value is expected to be `undefined` at runtime and is represented as `null` in JSON.

---

## Remote response unwrapping / transport errors

### TV-REMOTE-001

- **Vector ID**: TV-REMOTE-001
- **Description**: Wrapped and unwrapped successful responses are both accepted.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "queryResponses": [
      { "ok": true, "result": { "data": [{ "id": "task:1" }], "nextCursor": null } },
      { "data": [{ "id": "task:2" }], "nextCursor": null }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } }
  ]
}
```

- **Expected output**:

```json
{
  "results": [
    { "data": [{ "id": "task:1" }], "nextCursor": null },
    { "data": [{ "id": "task:2" }], "nextCursor": null }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-REMOTE-002

- **Vector ID**: TV-REMOTE-002
- **Description**: Invalid remote shapes are rejected as `TRANSPORT_ERROR`.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "queryResponses": [{ "hello": "world" }] },
  "ops": [{ "op": "createClient", "schema": "default" }, { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } }]
}
```

- **Expected output**:

```json
{
  "throws": {
    "code": "TRANSPORT_ERROR",
    "message": "Transport error: unexpected response shape",
    "details": { "path": "$" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Query

### TV-QUERY-001

- **Vector ID**: TV-QUERY-001
- **Description**: `DatafnTable.query` merges resource/version and ignores overrides.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "queryResponses": [{ "ok": true, "result": { "data": [], "nextCursor": null } }] },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "tableQuery", "table": "task", "query": { "resource": "goal", "version": 999, "select": ["id"] } }
  ]
}
```

- **Expected output**:

```json
{
  "remoteCalls": [
    {
      "method": "query",
      "arg": { "resource": "task", "version": 1, "select": ["id"] }
    }
  ],
  "result": { "data": [], "nextCursor": null }
}
```

- **Negative variant(s)**: N/A

### TV-QUERY-002

- **Vector ID**: TV-QUERY-002
- **Description**: Remote `ok:false` errors become thrown `DatafnClientError` with mapped code/message/path.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "queryResponses": [
      {
        "ok": false,
        "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: resource must be string", "details": { "path": "resource" } }
      }
    ]
  },
  "ops": [{ "op": "createClient", "schema": "default" }, { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } }]
}
```

- **Expected output**:

```json
{
  "throws": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: resource must be string",
    "details": { "path": "resource" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Mutation + events

### TV-MUT-001

- **Vector ID**: TV-MUT-001
- **Description**: Successful mutation emits `mutation_applied` with deterministic timestamp.
- **Input**:

```json
{
  "nowMs": 123,
  "remote": {
    "mutationResponses": [
      {
        "ok": true,
        "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false }
      }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "subscribeAllEvents" },
    {
      "op": "tableMutate",
      "table": "task",
      "mutation": { "operation": "insert", "clientId": "client:1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false },
  "observedEvents": [
    {
      "type": "mutation_applied",
      "resource": "task",
      "ids": ["task:1"],
      "mutationId": "m-1",
      "clientId": "client:1",
      "timestampMs": 123
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-MUT-002

- **Vector ID**: TV-MUT-002
- **Description**: Failed mutation emits `mutation_rejected` with error context.
- **Input**:

```json
{
  "nowMs": 5,
  "remote": {
    "mutationResponses": [
      {
        "ok": true,
        "result": {
          "ok": false,
          "mutationId": "m-2",
          "affectedIds": [],
          "errors": [{ "code": "DFQL_INVALID", "message": "Invalid DFQL: missing clientId or mutationId", "path": "$" }]
        }
      }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "subscribeAllEvents" },
    { "op": "tableMutate", "table": "task", "mutation": { "operation": "merge", "clientId": "client:1", "mutationId": "m-2", "id": "task:1", "record": { "title": "B" } } }
  ]
}
```

- **Expected output**:

```json
{
  "result": {
    "ok": false,
    "mutationId": "m-2",
    "affectedIds": [],
    "errors": [{ "code": "DFQL_INVALID", "message": "Invalid DFQL: missing clientId or mutationId", "path": "$" }]
  },
  "observedEvents": [
    {
      "type": "mutation_rejected",
      "resource": "task",
      "ids": ["task:1"],
      "mutationId": "m-2",
      "clientId": "client:1",
      "timestampMs": 5,
      "context": { "code": "DFQL_INVALID", "message": "Invalid DFQL: missing clientId or mutationId", "path": "$" }
    }
  ]
}
```

- **Negative variant(s)**: N/A

---

## Table subscription

### TV-SUB-001

- **Vector ID**: TV-SUB-001
- **Description**: `table.subscribe` only receives events for its own resource.
- **Input**:

```json
{
  "nowMs": 0,
  "ops": [
    { "op": "createClient", "schema": "default", "remote": "stub" },
    { "op": "subscribeTable", "table": "task" },
    { "op": "emitEvent", "event": { "type": "mutation_applied", "resource": "task", "ids": ["task:1"], "timestampMs": 0 } }
  ]
}
```

- **Expected output**:

```json
{ "observedEvents": [{ "type": "mutation_applied", "resource": "task", "ids": ["task:1"], "timestampMs": 0 }] }
```

- **Negative variant(s)**: N/A

### TV-SUB-002

- **Vector ID**: TV-SUB-002
- **Description**: `table.subscribe` must NOT deliver other-resource events.
- **Input**:

```json
{
  "nowMs": 0,
  "ops": [
    { "op": "createClient", "schema": "default", "remote": "stub" },
    { "op": "subscribeTable", "table": "task" },
    { "op": "emitEvent", "event": { "type": "mutation_applied", "resource": "goal", "ids": ["goal:1"], "timestampMs": 0 } }
  ]
}
```

- **Expected output**:

```json
{ "observedEvents": [] }
```

- **Negative variant(s)**: N/A

---

## Query signals

### TV-SIGNAL-001

- **Vector ID**: TV-SIGNAL-001
- **Description**: `table.signal` caches by `dfqlKey`, fetches on first subscribe, and refreshes on `mutation_applied` for same resource.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "queryResponses": [
      { "ok": true, "result": { "data": [{ "id": "task:1" }], "nextCursor": null } },
      { "ok": true, "result": { "data": [{ "id": "task:2" }], "nextCursor": null } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "makeSignal", "table": "task", "query": { "select": ["id"], "filters": { "isArchived": false } } },
    { "op": "makeSignal", "table": "task", "query": { "filters": { "isArchived": false }, "select": ["id"] } },
    { "op": "assertSameSignalIdentity" },
    { "op": "subscribeSignal" },
    { "op": "emitEvent", "event": { "type": "mutation_applied", "resource": "task", "ids": ["task:1"], "timestampMs": 0 } }
  ]
}
```

- **Expected output**:

```json
{
  "signalSameIdentityForEquivalentQuery": true,
  "observedSignalValues": [
    { "data": [{ "id": "task:1" }], "nextCursor": null },
    { "data": [{ "id": "task:2" }], "nextCursor": null }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SIGNAL-002

- **Vector ID**: TV-SIGNAL-002
- **Description**: If refresh fetch fails, signal value remains unchanged and subscribers are not notified.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "queryResponses": [
      { "ok": true, "result": { "data": [{ "id": "task:1" }], "nextCursor": null } },
      { "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: expected object or array", "details": { "path": "$" } } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "makeSignal", "table": "task", "query": { "select": ["id"] } },
    { "op": "subscribeSignal" },
    { "op": "emitEvent", "event": { "type": "mutation_applied", "resource": "task", "ids": ["task:1"], "timestampMs": 0 } }
  ]
}
```

- **Expected output**:

```json
{
  "observedSignalValues": [{ "data": [{ "id": "task:1" }], "nextCursor": null }]
}
```

- **Negative variant(s)**: N/A

---

## Sync facade

### TV-SYNC-001

- **Vector ID**: TV-SYNC-001
- **Description**: `client.sync.seed/clone/pull/push` delegates to remote and unwraps envelope.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "seedResponses": [{ "ok": true, "result": { "ok": true } }],
    "cloneResponses": [{ "ok": true, "result": { "ok": true } }],
    "pullResponses": [{ "ok": true, "result": { "ok": true } }],
    "pushResponses": [{ "ok": true, "result": { "ok": true } }]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "syncCall", "method": "seed", "payload": { "clientId": "client:1" } },
    { "op": "syncCall", "method": "clone", "payload": { "clientId": "client:1" } },
    { "op": "syncCall", "method": "pull", "payload": { "clientId": "client:1" } },
    { "op": "syncCall", "method": "push", "payload": { "clientId": "client:1" } }
  ]
}
```

- **Expected output**:

```json
{ "results": [{ "ok": true }, { "ok": true }, { "ok": true }, { "ok": true }] }
```

- **Negative variant(s)**: N/A

### TV-SYNC-002

- **Vector ID**: TV-SYNC-002
- **Description**: Missing remote sync methods cause `TRANSPORT_ERROR`.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "seed": "missing" },
  "ops": [{ "op": "createClient", "schema": "default" }, { "op": "syncCall", "method": "seed", "payload": { "clientId": "client:1" } }]
}
```

- **Expected output**:

```json
{
  "throws": {
    "code": "TRANSPORT_ERROR",
    "message": "Transport error: remote method missing: seed",
    "details": { "path": "sync.seed" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Transact (client)

### TV-TX-001

- **Vector ID**: TV-TX-001
- **Description**: `client.transact` and `client.<table>.transact` delegate to remote and unwrap wrapped responses.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": {
    "transactResponses": [
      {
        "ok": true,
        "result": { "ok": true, "results": [{ "kind": "query", "ok": true, "result": { "data": [], "nextCursor": null } }] }
      }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "clientTransact", "payload": { "transactionId": "tx-1", "atomic": true, "steps": [] } },
    { "op": "tableTransact", "table": "task", "payload": { "transactionId": "tx-2", "atomic": true, "steps": [] } }
  ]
}
```

- **Expected output**:

```json
{
  "results": [
    { "ok": true, "results": [{ "kind": "query", "ok": true, "result": { "data": [], "nextCursor": null } }] },
    { "ok": true, "results": [{ "kind": "query", "ok": true, "result": { "data": [], "nextCursor": null } }] }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-TX-002

- **Vector ID**: TV-TX-002
- **Description**: Unexpected transact response shape throws `TRANSPORT_ERROR`.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "transactResponses": [{ "hello": "world" }] },
  "ops": [{ "op": "createClient", "schema": "default" }, { "op": "clientTransact", "payload": { "transactionId": "tx-1", "atomic": true, "steps": [] } }]
}
```

- **Expected output**:

```json
{
  "throws": {
    "code": "TRANSPORT_ERROR",
    "message": "Transport error: unexpected response shape",
    "details": { "path": "$" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Server (seed endpoint)

### TV-SEED-001

- **Vector ID**: TV-SEED-001
- **Description**: `POST /datafn/seed` accepts `{ clientId }` and returns `{ ok:true, result:{ ok:true } }`.
- **Input**:

```json
{
  "request": { "method": "POST", "path": "/datafn/seed", "body": { "clientId": "client:device-1" } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "ok": true } }
```

- **Negative variant(s)**: N/A

### TV-SEED-002

- **Vector ID**: TV-SEED-002
- **Description**: Missing/invalid `clientId` is rejected with `DFQL_INVALID`.
- **Input**:

```json
{ "request": { "method": "POST", "path": "/datafn/seed", "body": {} } }
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: clientId must be string",
    "details": { "path": "clientId" }
  }
}
```

- **Negative variant(s)**: N/A

---

## Server (envelopes / status / auth / sync)

### TV-SERVER-ENV-001

- **Vector ID**: TV-SERVER-ENV-001
- **Description**: Invalid JSON is a top-level `ok:false` envelope (not a nested `{ ok:false }` result).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/clone", "rawBody": "{", "headers": { "content-type": "application/json" } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-SERVER-ENV-002

- **Vector ID**: TV-SERVER-ENV-002
- **Description**: Invalid JSON on `/datafn/push` is also a top-level `ok:false` envelope.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/push", "rawBody": "not-json", "headers": { "content-type": "application/json" } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-STATUS-001

- **Vector ID**: TV-STATUS-001
- **Description**: `/datafn/status` advertises full capabilities when DB is healthy.
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn", "healthy": true },
    "getServerTimeMs": 0
  },
  "request": { "method": "GET", "path": "/datafn/status" }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "schemaHash": "sha256:7cd660d90a4df81f3de0c6035792d0ba0911151ae5066135499f969249c7d270",
    "capabilities": ["dfql.query", "dfql.mutation", "dfql.transact", "sync.seed", "sync.clone", "sync.pull", "sync.push"],
    "limits": { "maxLimit": 100 },
    "serverTimeMs": 0
  }
}
```

- **Negative variant(s)**: N/A

Notes:
- `schemaHash` above is computed as `computeSchemaHash(validateSchema(schema).result)` for the default schema in this file.

### TV-STATUS-002

- **Vector ID**: TV-STATUS-002
- **Description**: Unhealthy DB makes `/datafn/status` return `ok:false INTERNAL`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn", "healthy": false } },
  "request": { "method": "GET", "path": "/datafn/status" }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "INTERNAL", "message": "Internal error", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-AUTH-001

- **Vector ID**: TV-AUTH-001
- **Description**: Authorization receives the parsed request payload (not `null`).
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" },
    "authorize": "denyIfPayloadNull"
  },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-AUTH-002

- **Vector ID**: TV-AUTH-002
- **Description**: Authorization denial returns `FORBIDDEN`.
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" },
    "authorize": "denyAll"
  },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-CONFLICT-001

- **Vector ID**: TV-CONFLICT-001
- **Description**: Default conflict policy is last-write-wins by server ordering.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-1",
        "id": "task:1",
        "record": { "title": "A" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:2",
        "mutationId": "m-2",
        "id": "task:1",
        "record": { "title": "B" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "id": "task:1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-2", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "B" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-CONFLICT-002

- **Vector ID**: TV-CONFLICT-002
- **Description**: Client timestamps do not affect conflict ordering.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-ts-1",
        "id": "task:1",
        "record": { "title": "OldTs" },
        "context": { "clientTimestampMs": 999999 }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:2",
        "mutationId": "m-ts-2",
        "id": "task:1",
        "record": { "title": "Wins" },
        "context": { "clientTimestampMs": 0 }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "id": "task:1" } }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-ts-1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-ts-2", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "Wins" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SERVER-CLONE-001

- **Vector ID**: TV-SERVER-CLONE-001
- **Description**: `/datafn/clone` returns deterministic snapshot and cursor.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-c1", "id": "task:1", "record": { "title": "A" } }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-c2", "id": "task:2", "record": { "title": "B" } }
    },
    { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:1", "tables": ["task"] } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-c1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-c2", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    {
      "ok": true,
      "result": {
        "ok": true,
        "data": { "task": [{ "id": "task:1", "title": "A" }, { "id": "task:2", "title": "B" }] },
        "cursors": { "task": "2" }
      }
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SERVER-CLONE-002

- **Vector ID**: TV-SERVER-CLONE-002
- **Description**: Cloning a remote-only table is rejected.
- **Input**:

```json
{
  "server": {
    "schema": {
      "resources": [
        { "name": "remote", "version": 1, "isRemoteOnly": true, "fields": [{ "name": "label", "type": "string", "required": true }] }
      ],
      "relations": []
    },
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }
  },
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:1", "tables": ["remote"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: remote-only table cannot be cloned: remote", "details": { "path": "tables" } } }
```

- **Negative variant(s)**: N/A

### TV-SERVER-PULL-001

- **Vector ID**: TV-SERVER-PULL-001
- **Description**: `/datafn/pull` returns records+deleted since cursor and advances cursor.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-p1", "id": "task:1", "record": { "title": "A" } }
    },
    { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:1", "cursors": { "task": "0" } } },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": { "resource": "task", "version": 1, "operation": "delete", "clientId": "client:1", "mutationId": "m-p2", "id": "task:1" }
    },
    { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:1", "cursors": { "task": "1" } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-p1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    {
      "ok": true,
      "result": { "ok": true, "records": { "task": [{ "id": "task:1", "title": "A" }] }, "deleted": { "task": [] }, "cursors": { "task": "1" } }
    },
    { "ok": true, "result": { "ok": true, "mutationId": "m-p2", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "records": { "task": [] }, "deleted": { "task": ["task:1"] }, "cursors": { "task": "2" } } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SERVER-PULL-002

- **Vector ID**: TV-SERVER-PULL-002
- **Description**: Invalid cursor values are rejected with `DFQL_INVALID`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:1", "cursors": { "task": "nope" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: cursor must be an integer string", "details": { "path": "cursors.task" } } }
```

- **Negative variant(s)**: N/A

### TV-SERVER-PUSH-001

- **Vector ID**: TV-SERVER-PUSH-001
- **Description**: `/datafn/push` applies mutations and makes them observable via `/datafn/pull`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/push",
      "body": {
        "clientId": "client:1",
        "mutations": [
          {
            "resource": "task",
            "version": 1,
            "operation": "merge",
            "clientId": "client:1",
            "mutationId": "m-push-1",
            "id": "task:1",
            "record": { "title": "P" }
          }
        ]
      }
    },
    { "method": "POST", "path": "/datafn/pull", "body": { "clientId": "client:1", "cursors": { "task": "0" } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "applied": ["m-push-1"], "errors": [] } },
    { "ok": true, "result": { "ok": true, "records": { "task": [{ "id": "task:1", "title": "P" }] }, "deleted": { "task": [] }, "cursors": { "task": "1" } } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SERVER-PUSH-002

- **Vector ID**: TV-SERVER-PUSH-002
- **Description**: Missing/invalid `clientId` on push is rejected with `DFQL_INVALID`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/push", "body": { "mutations": [] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: clientId must be string", "details": { "path": "clientId" } } }
```

- **Negative variant(s)**: N/A

---

## Server persistence (superfunctions/db)

### TV-DB-001

- **Vector ID**: TV-DB-001
- **Description**: Server configured with a `@superfunctions/db` memory adapter persists records via `/datafn/mutation` and reads via `/datafn/query`.
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }
  },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "insert",
        "clientId": "client:1",
        "mutationId": "m-1",
        "id": "task:1",
        "record": { "title": "A" }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "id": "task:1" } }
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
      "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false }
    },
    {
      "ok": true,
      "result": { "data": [{ "id": "task:1", "title": "A" }], "nextCursor": null }
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DB-002

- **Vector ID**: TV-DB-002
- **Description**: Missing/invalid DB adapter makes server endpoints return deterministic `INTERNAL`.
- **Input**:

```json
{
  "server": { "db": null },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "INTERNAL", "message": "Internal error", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-IDEMP-001

- **Vector ID**: TV-IDEMP-001
- **Description**: Idempotency dedupe survives restart with persistent adapter state.
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn", "preserveStateAcrossRestart": true }
  },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-idem",
        "id": "task:1",
        "record": { "title": "B" }
      }
    },
    { "op": "serverRestart" },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-idem",
        "id": "task:1",
        "record": { "title": "B" }
      }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-idem", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-idem", "affectedIds": ["task:1"], "errors": [], "deduped": true } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-IDEMP-002

- **Vector ID**: TV-IDEMP-002
- **Description**: Missing `clientId`/`mutationId` still fails deterministically (no idempotency record is written).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": {
    "method": "POST",
    "path": "/datafn/mutation",
    "body": { "resource": "task", "version": 1, "operation": "merge", "id": "task:1", "record": { "title": "X" } }
  }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": false,
    "mutationId": "",
    "affectedIds": [],
    "errors": [{ "code": "DFQL_INVALID", "message": "Invalid DFQL: missing clientId or mutationId", "path": "$" }],
    "deduped": false
  }
}
```

- **Negative variant(s)**: N/A

---

## Plugins

### TV-PLUG-CLIENT-001

- **Vector ID**: TV-PLUG-CLIENT-001
- **Description**: Client `beforeQuery` plugins can deterministically transform outgoing queries.
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "queryResponses": [{ "ok": true, "result": { "data": [], "nextCursor": null } }] },
  "ops": [
    {
      "op": "createClient",
      "schema": "default",
      "plugins": [{ "name": "p1", "runsOn": ["client"], "beforeQuery": "addFilterIsArchivedFalse" }]
    },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } }
  ]
}
```

- **Expected output**:

```json
{
  "remoteCalls": {
    "query": [
      { "resource": "task", "version": 1, "select": ["id"], "filters": { "isArchived": false } }
    ]
  }
}
```

- **Negative variant(s)**: N/A

### TV-PLUG-CLIENT-002

- **Vector ID**: TV-PLUG-CLIENT-002
- **Description**: Client `beforeQuery` plugin failures are fail-closed (no remote call is made).
- **Input**:

```json
{
  "nowMs": 0,
  "remote": { "queryResponses": [{ "ok": true, "result": { "data": [], "nextCursor": null } }] },
  "ops": [
    {
      "op": "createClient",
      "schema": "default",
      "plugins": [{ "name": "p1", "runsOn": ["client"], "beforeQuery": "throwForbidden" }]
    },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id"] } }
  ]
}
```

- **Expected output**:

```json
{
  "throws": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "plugins.p1.beforeQuery" } },
  "remoteCalls": { "query": [] }
}
```

- **Negative variant(s)**: N/A

### TV-PLUG-SERVER-001

- **Vector ID**: TV-PLUG-SERVER-001
- **Description**: Server `beforeQuery` plugins run in order and can inject deterministic filters.
- **Input**:

```json
{
  "server": {
    "schema": {
      "resources": [
        {
          "name": "task",
          "version": 1,
          "fields": [
            { "name": "title", "type": "string", "required": true },
            { "name": "isArchived", "type": "boolean", "required": true }
          ]
        }
      ],
      "relations": []
    },
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" },
    "plugins": [{ "name": "p1", "runsOn": ["server"], "beforeQuery": "addFilterIsArchivedFalse" }]
  },
  "requests": [
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "insert",
        "clientId": "client:1",
        "mutationId": "m-a",
        "id": "task:1",
        "record": { "title": "A", "isArchived": false }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/mutation",
      "body": {
        "resource": "task",
        "version": 1,
        "operation": "insert",
        "clientId": "client:1",
        "mutationId": "m-b",
        "id": "task:2",
        "record": { "title": "B", "isArchived": true }
      }
    },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "task", "version": 1, "select": ["id", "title"], "sort": ["id:asc"] }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-a", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-b", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "A" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-PLUG-SERVER-002

- **Vector ID**: TV-PLUG-SERVER-002
- **Description**: Server `beforeMutation` plugin failures are fail-closed.
- **Input**:

```json
{
  "server": {
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" },
    "plugins": [{ "name": "p1", "runsOn": ["server"], "beforeMutation": "throwForbidden" }]
  },
  "request": {
    "method": "POST",
    "path": "/datafn/mutation",
    "body": {
      "resource": "task",
      "version": 1,
      "operation": "merge",
      "clientId": "client:1",
      "mutationId": "m-deny",
      "id": "task:1",
      "record": { "title": "X" }
    }
  }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

---

## Subscriptions (extra filter dimensions)

### TV-SUB-EXTRA-001

- **Vector ID**: TV-SUB-EXTRA-001
- **Description**: `mutation_applied` events include `action` + `fields`, and filters can match by `action`.
- **Input**:

```json
{
  "nowMs": 5,
  "remote": {
    "mutationResponses": [
      { "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "subscribe", "filter": { "resource": "task", "action": "merge" } },
    {
      "op": "tableMutate",
      "table": "task",
      "mutation": {
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-1",
        "id": "task:1",
        "record": { "title": "A", "done": true }
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
      "resource": "task",
      "ids": ["task:1"],
      "mutationId": "m-1",
      "clientId": "client:1",
      "timestampMs": 5,
      "action": "merge",
      "fields": ["done", "title"]
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SUB-EXTRA-002

- **Vector ID**: TV-SUB-EXTRA-002
- **Description**: Filters can match by changed fields (intersection semantics).
- **Input**:

```json
{
  "nowMs": 5,
  "remote": {
    "mutationResponses": [
      { "ok": true, "result": { "ok": true, "mutationId": "m-2", "affectedIds": ["task:1"], "errors": [], "deduped": false } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default" },
    { "op": "subscribe", "filter": { "resource": "task", "fields": ["done"] } },
    {
      "op": "tableMutate",
      "table": "task",
      "mutation": {
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-2",
        "id": "task:1",
        "record": { "title": "OnlyTitleChanged" }
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

## DFQL completeness (server)

Schema fixture `dfql` used by DFQL vectors:

```json
{
  "resources": [
    { "name": "goal", "version": 1, "fields": [{ "name": "label", "type": "string", "required": true }, { "name": "parentPath", "type": "string", "required": true }] },
    { "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] },
    { "name": "tag", "version": 1, "fields": [{ "name": "label", "type": "string", "required": true }] }
  ],
  "relations": [
    { "from": "goal", "to": "task", "type": "one-many", "relation": "tasks", "inverse": "goal", "fkField": "goalId" },
    { "from": "task", "to": "tag", "type": "many-many", "relation": "tags", "inverse": "tasks", "metadata": [{ "name": "order", "type": "number" }] },
    { "from": "goal", "to": "goal", "type": "htree", "relation": "parent", "inverse": "children", "pathField": "parentPath" }
  ]
}
```

### TV-DFQL-OMIT-001

- **Vector ID**: TV-DFQL-OMIT-001
- **Description**: `omit` removes fields from result records.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-o1", "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "title"], "omit": ["title"], "filters": { "id": "task:1" } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-o1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-OMIT-002

- **Vector ID**: TV-DFQL-OMIT-002
- **Description**: Unknown omitted fields are rejected with `DFQL_UNKNOWN_FIELD`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "omit": ["nope"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_FIELD", "message": "Unknown field: omit[0]", "details": { "path": "omit[0]" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-RELIDS-001

- **Vector ID**: TV-DFQL-RELIDS-001
- **Description**: ids-only relation tokens return related ids according to cardinality.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-r1", "id": "goal:g1", "record": { "label": "G1", "parentPath": "" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-r2", "id": "task:t1", "record": { "title": "T1", "goalId": "goal:g1" } } },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": [
        { "resource": "goal", "version": 1, "select": ["id", "tasks"], "filters": { "id": "goal:g1" } },
        { "resource": "task", "version": 1, "select": ["id", "goal"], "filters": { "id": "task:t1" } }
      ]
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-r1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-r2", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    {
      "ok": true,
      "result": [
        { "data": [{ "id": "goal:g1", "tasks": ["task:t1"] }], "nextCursor": null },
        { "data": [{ "id": "task:t1", "goal": "goal:g1" }], "nextCursor": null }
      ]
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-RELIDS-002

- **Vector ID**: TV-DFQL-RELIDS-002
- **Description**: ids-only tokens for unknown relations are rejected.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["tags"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_FIELD", "message": "Unknown field: select[0]", "details": { "path": "select[0]" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-NESTED-001

- **Vector ID**: TV-DFQL-NESTED-001
- **Description**: Nested select traversal tokens expand intermediate relations.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-n1", "id": "goal:g1", "record": { "label": "G1", "parentPath": "" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-n2", "id": "task:t1", "record": { "title": "T1", "goalId": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-n3", "id": "task:t2", "record": { "title": "T2", "goalId": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "tag", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-n4", "id": "tag:a", "record": { "label": "urgent" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "tag", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-n5", "id": "tag:b", "record": { "label": "home" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-n6", "id": "task:t1", "relations": { "tags": { "$ref": "tag:a", "order": 0 } } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-n7", "id": "task:t1", "relations": { "tags": { "$ref": "tag:b", "order": 1 } } } },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": { "resource": "goal", "version": 1, "select": ["id", "tasks.*", "tasks.tags.*"], "filters": { "id": "goal:g1" }, "sort": ["id:asc"] }
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-n1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n2", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n3", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n4", "affectedIds": ["tag:a"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n5", "affectedIds": ["tag:b"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n6", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-n7", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    {
      "ok": true,
      "result": {
        "data": [
          {
            "id": "goal:g1",
            "tasks": [
              { "id": "task:t1", "title": "T1", "tags": [{ "id": "tag:a", "label": "urgent" }, { "id": "tag:b", "label": "home" }] },
              { "id": "task:t2", "title": "T2", "tags": [] }
            ]
          }
        ],
        "nextCursor": null
      }
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-NESTED-002

- **Vector ID**: TV-DFQL-NESTED-002
- **Description**: Invalid nested traversal tokens are rejected.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["tasks.nope.*"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_RELATION", "message": "Unknown relation: select[0]", "details": { "path": "select[0]" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-FILTERPATH-001

- **Vector ID**: TV-DFQL-FILTERPATH-001
- **Description**: Dot-path filters across relations work with default ANY semantics.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-f1", "id": "goal:g1", "record": { "label": "G1", "parentPath": "" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-f2", "id": "goal:g2", "record": { "label": "G2", "parentPath": "" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-f3", "id": "task:t1", "record": { "title": "A", "goalId": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-f4", "id": "task:t2", "record": { "title": "B", "goalId": "goal:g2" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "goal.label": "G1" }, "sort": ["id:asc"] } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-f1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-f2", "affectedIds": ["goal:g2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-f3", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-f4", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t1", "title": "A" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-FILTERPATH-002

- **Vector ID**: TV-DFQL-FILTERPATH-002
- **Description**: Unknown dot-path filters are rejected deterministically.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "goal.nope": "x" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_FIELD", "message": "Unknown field: filters.goal.nope", "details": { "path": "filters.goal.nope" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-RELQ-001

- **Vector ID**: TV-DFQL-RELQ-001
- **Description**: Relation quantifiers `$all` / `$any` / `$none` work as specified.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "tag", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-q1", "id": "tag:urgent", "record": { "label": "urgent" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "tag", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-q2", "id": "tag:home", "record": { "label": "home" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "tag", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-q3", "id": "tag:bug", "record": { "label": "bug" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-q4", "id": "task:t1", "record": { "title": "T1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-q5", "id": "task:t2", "record": { "title": "T2" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-q6", "id": "task:t1", "relations": { "tags": { "$ref": "tag:urgent", "order": 0 } } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-q7", "id": "task:t1", "relations": { "tags": { "$ref": "tag:home", "order": 1 } } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-q8", "id": "task:t2", "relations": { "tags": { "$ref": "tag:urgent", "order": 0 } } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "relate", "clientId": "client:1", "mutationId": "m-q9", "id": "task:t2", "relations": { "tags": { "$ref": "tag:bug", "order": 1 } } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "tags": { "$all": { "label": ["urgent", "home"] } } }, "sort": ["id:asc"] } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-q1", "affectedIds": ["tag:urgent"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q2", "affectedIds": ["tag:home"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q3", "affectedIds": ["tag:bug"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q4", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q5", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q6", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q7", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q8", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-q9", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t1" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-RELQ-002

- **Vector ID**: TV-DFQL-RELQ-002
- **Description**: Unknown relation quantifier keys are rejected.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "tags": { "$wat": { "label": "x" } } } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: unknown relation quantifier $wat", "details": { "path": "filters.tags" } } }
```

- **Negative variant(s)**: N/A

### TV-HTREE-001

- **Vector ID**: TV-HTREE-001
- **Description**: `parent.*` and `children.**` work for `htree` relations.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-h1", "id": "goal:g1", "record": { "label": "Root", "parentPath": "" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-h2", "id": "goal:g2", "record": { "label": "Child", "parentPath": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "goal", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-h3", "id": "goal:g3", "record": { "label": "Grand", "parentPath": "goal:g1-goal:g2" } } },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": [
        { "resource": "goal", "version": 1, "select": ["id", "parent.*"], "filters": { "id": "goal:g3" } },
        { "resource": "goal", "version": 1, "select": ["id", "children.**"], "filters": { "id": "goal:g1" }, "sort": ["id:asc"] }
      ]
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-h1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-h2", "affectedIds": ["goal:g2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-h3", "affectedIds": ["goal:g3"], "errors": [], "deduped": false } },
    {
      "ok": true,
      "result": [
        { "data": [{ "id": "goal:g3", "parent": [{ "id": "goal:g1", "label": "Root", "parentPath": "" }, { "id": "goal:g2", "label": "Child", "parentPath": "goal:g1" }] }], "nextCursor": null },
        { "data": [{ "id": "goal:g1", "children": [{ "id": "goal:g2", "label": "Child", "parentPath": "goal:g1" }, { "id": "goal:g3", "label": "Grand", "parentPath": "goal:g1-goal:g2" }] }], "nextCursor": null }
      ]
    }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-HTREE-002

- **Vector ID**: TV-HTREE-002
- **Description**: Unsupported htree token forms are rejected.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "goal", "version": 1, "select": ["parent.**"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: select.parent.**", "details": { "path": "select[0]" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-COUNT-001

- **Vector ID**: TV-DFQL-COUNT-001
- **Description**: `count:true` returns total rows before pagination.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-cnt1", "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-cnt2", "id": "task:2", "record": { "title": "B" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "sort": ["id:asc"], "limit": 1, "count": true } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-cnt1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-cnt2", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1" }], "count": 2, "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-COUNT-002

- **Vector ID**: TV-DFQL-COUNT-002
- **Description**: Invalid `count` values are rejected with `DFQL_INVALID`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "count": "yes" } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: count must be boolean", "details": { "path": "count" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-GROUP-001

- **Vector ID**: TV-DFQL-GROUP-001
- **Description**: `groupBy` + `aggregations` + `having` returns grouped rows.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-g1", "id": "task:1", "record": { "title": "A", "goalId": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-g2", "id": "task:2", "record": { "title": "B", "goalId": "goal:g1" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-g3", "id": "task:3", "record": { "title": "C", "goalId": "goal:g2" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "groupBy": ["goalId"], "aggregations": { "n": { "op": "count", "field": "*" } }, "having": { "n": { "gt": 1 } } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-g1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-g2", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-g3", "affectedIds": ["task:3"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "groups": [{ "goalId": "goal:g1", "n": 2 }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-GROUP-002

- **Vector ID**: TV-DFQL-GROUP-002
- **Description**: Relation expansions are rejected when `groupBy` is present.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "groupBy": ["goalId"], "aggregations": { "n": { "op": "count", "field": "*" } }, "select": ["goal.*"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: select relations in aggregate query", "details": { "path": "select[0]" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-BEFORE-001

- **Vector ID**: TV-DFQL-BEFORE-001
- **Description**: `cursor.before` paginates backwards.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-b1", "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-b2", "id": "task:2", "record": { "title": "B" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-b3", "id": "task:3", "record": { "title": "C" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "title"], "sort": ["title:asc", "id:asc"], "limit": 1, "cursor": { "before": { "title": "B", "id": "task:2" } } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-b1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-b2", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-b3", "affectedIds": ["task:3"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "A" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-BEFORE-002

- **Vector ID**: TV-DFQL-BEFORE-002
- **Description**: Cursor pagination without `id` tie-breaker is rejected.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "sort": ["title:asc"], "cursor": { "before": { "title": "B" } } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: cursor requires sort with id tie-breaker", "details": { "path": "$" } } }
```

- **Negative variant(s)**: N/A

### TV-DFQL-OPS-001

- **Vector ID**: TV-DFQL-OPS-001
- **Description**: Additional filter operators (`not_ilike`, `is_empty`) work.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-op1", "id": "task:1", "record": { "title": "Alpha" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-op2", "id": "task:2", "record": { "title": "beta" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-op3", "id": "task:3", "record": { "title": "" } } },
    {
      "method": "POST",
      "path": "/datafn/query",
      "body": [
        { "resource": "task", "version": 1, "select": ["id"], "filters": { "title": { "not_ilike": "a%" } }, "sort": ["id:asc"] },
        { "resource": "task", "version": 1, "select": ["id"], "filters": { "title": { "is_empty": true } }, "sort": ["id:asc"] }
      ]
    }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-op1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-op2", "affectedIds": ["task:2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-op3", "affectedIds": ["task:3"], "errors": [], "deduped": false } },
    { "ok": true, "result": [{ "data": [{ "id": "task:2" }, { "id": "task:3" }], "nextCursor": null }, { "data": [{ "id": "task:3" }], "nextCursor": null }] }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-DFQL-OPS-002

- **Vector ID**: TV-DFQL-OPS-002
- **Description**: Unknown filter operators are rejected with `DFQL_UNSUPPORTED`.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "title": { "wat": "x" } } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: filters.title.wat", "details": { "path": "filters.title.wat" } } }
```

- **Negative variant(s)**: N/A

---

## Search plugin (`searchfn`)

### TV-SEARCH-001

- **Vector ID**: TV-SEARCH-001
- **Description**: With a `searchfn` plugin installed, `search` is delegated and candidates are filtered deterministically.
- **Input**:

```json
{
  "server": {
    "schema": "dfql",
    "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" },
    "plugins": [{ "name": "searchfn", "runsOn": ["server"], "beforeQuery": "searchCandidatesByQuery" }]
  },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-s1", "id": "task:t1", "record": { "title": "Alpha" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-s2", "id": "task:t2", "record": { "title": "Beta" } } },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "title"], "search": { "query": "beta", "type": "fullText", "fields": ["title"] }, "sort": ["id:asc"] } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-s1", "affectedIds": ["task:t1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-s2", "affectedIds": ["task:t2"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:t2", "title": "Beta" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-SEARCH-002

- **Vector ID**: TV-SEARCH-002
- **Description**: Without a `searchfn` plugin, `search` is rejected with `DFQL_UNSUPPORTED`.
- **Input**:

```json
{
  "server": { "schema": "dfql", "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"], "search": { "query": "x", "type": "fullText" } } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNSUPPORTED", "message": "Unsupported DFQL feature: query.search", "details": { "path": "search" } } }
```

- **Negative variant(s)**: N/A

---

## Client storage adapters

### TV-STORAGE-001

- **Vector ID**: TV-STORAGE-001
- **Description**: Storage adapter supports records, cursors, hydration state, and changelog append/list.
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.memory" },
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "getRecord", "resource": "task", "id": "task:1" },
    { "op": "setCursor", "resource": "task", "cursor": "3" },
    { "op": "getCursor", "resource": "task" },
    { "op": "setHydrationState", "resource": "task", "state": "ready" },
    { "op": "getHydrationState", "resource": "task" },
    {
      "op": "changelogAppend",
      "entry": {
        "clientId": "client:1",
        "mutationId": "m-1",
        "mutation": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" } },
        "timestampMs": 0
      }
    },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{
  "results": {
    "getRecord": { "id": "task:1", "title": "A" },
    "getCursor": "3",
    "getHydrationState": "ready",
    "changelogList": [{ "seq": 1, "clientId": "client:1", "mutationId": "m-1" }]
  }
}
```

- **Negative variant(s)**: N/A

### TV-STORAGE-002

- **Vector ID**: TV-STORAGE-002
- **Description**: Storage adapter rejects invalid changelog acknowledgements deterministically.
- **Input**:

```json
{ "storage": { "type": "datafn.storage.memory" }, "ops": [{ "op": "changelogAck", "throughSeq": "nope" }] }
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: throughSeq must be integer", "details": { "path": "storage.changelogAck.throughSeq" } } }
```

- **Negative variant(s)**: N/A

### TV-STORAGE-003

- **Vector ID**: TV-STORAGE-003
- **Description**: Memory adapter list ordering is deterministic (`id:asc`).
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.memory" },
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:2", "title": "B" } },
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "listRecords", "resource": "task" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "listRecords": [{ "id": "task:1", "title": "A" }, { "id": "task:2", "title": "B" }] } }
```

- **Negative variant(s)**: N/A

### TV-STORAGE-IDB-001

- **Vector ID**: TV-STORAGE-IDB-001
- **Description**: IndexedDB adapter persists records across adapter re-instantiation.
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.indexeddb", "dbName": "tv-idb-1" },
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "reopenAdapter" },
    { "op": "getRecord", "resource": "task", "id": "task:1" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "getRecord": { "id": "task:1", "title": "A" } } }
```

- **Negative variant(s)**: N/A

### TV-STORAGE-IDB-002

- **Vector ID**: TV-STORAGE-IDB-002
- **Description**: Different IndexedDB database names isolate data.
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.indexeddb", "dbName": "tv-idb-2a" },
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "switchDbName", "dbName": "tv-idb-2b" },
    { "op": "getRecord", "resource": "task", "id": "task:1" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "getRecord": null } }
```

- **Negative variant(s)**: N/A

---

## Offline local-first + hydration

### TV-OFFLINE-QUERY-001

- **Vector ID**: TV-OFFLINE-QUERY-001
- **Description**: When hydration is `ready`, queries are local-first (no remote call).
- **Input**:

```json
{
  "nowMs": 0,
  "storage": {
    "type": "datafn.storage.memory",
    "state": {
      "records": { "task": [{ "id": "task:1", "title": "Local" }] },
      "hydration": { "task": "ready" }
    }
  },
  "remote": { "queryResponses": [{ "ok": true, "result": { "data": [{ "id": "task:1", "title": "Remote" }], "nextCursor": null } }] },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id", "title"], "filters": { "id": "task:1" } } }
  ]
}
```

- **Expected output**:

```json
{
  "results": [{ "data": [{ "id": "task:1", "title": "Local" }], "nextCursor": null }],
  "remoteCalls": { "query": [] }
}
```

- **Negative variant(s)**: N/A

### TV-OFFLINE-QUERY-002

- **Vector ID**: TV-OFFLINE-QUERY-002
- **Description**: When hydration is `hydrating`, queries use remote fallback.
- **Input**:

```json
{
  "nowMs": 0,
  "storage": { "type": "datafn.storage.memory", "state": { "hydration": { "task": "hydrating" } } },
  "remote": { "queryResponses": [{ "ok": true, "result": { "data": [{ "id": "task:1", "title": "Remote" }], "nextCursor": null } }] },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "tableQuery", "table": "task", "query": { "select": ["id", "title"], "filters": { "id": "task:1" } } }
  ]
}
```

- **Expected output**:

```json
{
  "results": [{ "data": [{ "id": "task:1", "title": "Remote" }], "nextCursor": null }],
  "remoteCalls": { "query": [{ "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "id": "task:1" } }] }
}
```

- **Negative variant(s)**: N/A

### TV-OFFLINE-MUT-001

- **Vector ID**: TV-OFFLINE-MUT-001
- **Description**: When remote mutation fails, client applies optimistic local write and appends to change log.
- **Input**:

```json
{
  "nowMs": 10,
  "storage": { "type": "datafn.storage.memory" },
  "remote": { "mutationResponses": [{ "throws": { "message": "Network down" } }] },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    {
      "op": "tableMutate",
      "table": "task",
      "mutation": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-off-1", "id": "task:1", "record": { "title": "Offline" } }
    },
    { "op": "storageGetRecord", "resource": "task", "id": "task:1" },
    { "op": "storageChangelogList" }
  ]
}
```

- **Expected output**:

```json
{
  "results": {
    "storageGetRecord": { "id": "task:1", "title": "Offline" },
    "storageChangelogList": [{ "seq": 1, "clientId": "client:1", "mutationId": "m-off-1" }]
  }
}
```

- **Negative variant(s)**: N/A

### TV-OFFLINE-MUT-002

- **Vector ID**: TV-OFFLINE-MUT-002
- **Description**: If change log append fails, offline mutation fails deterministically.
- **Input**:

```json
{
  "nowMs": 10,
  "storage": { "type": "datafn.storage.memory", "fail": { "changelogAppend": true } },
  "remote": { "mutationResponses": [{ "throws": { "message": "Network down" } }] },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "tableMutate", "table": "task", "mutation": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-off-2", "id": "task:1", "record": { "title": "X" } } }
  ]
}
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: changelogAppend failed", "details": { "path": "storage.changelogAppend" } } }
```

- **Negative variant(s)**: N/A

### TV-CHANGELOG-001

- **Vector ID**: TV-CHANGELOG-001
- **Description**: Change log de-duplicates by `(clientId, mutationId)`.
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.memory" },
  "ops": [
    { "op": "changelogAppend", "entry": { "clientId": "client:1", "mutationId": "m-1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogAppend", "entry": { "clientId": "client:1", "mutationId": "m-1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "changelogList": [{ "seq": 1, "clientId": "client:1", "mutationId": "m-1" }] } }
```

- **Negative variant(s)**: N/A

### TV-CHANGELOG-002

- **Vector ID**: TV-CHANGELOG-002
- **Description**: Change log acknowledges entries through a sequence number.
- **Input**:

```json
{
  "storage": { "type": "datafn.storage.memory" },
  "ops": [
    { "op": "changelogAppend", "entry": { "clientId": "client:1", "mutationId": "m-1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogAck", "throughSeq": 1 },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "changelogList": [] } }
```

- **Negative variant(s)**: N/A

### TV-CLIENT-SYNC-APPLY-001

- **Vector ID**: TV-CLIENT-SYNC-APPLY-001
- **Description**: Clone results are applied to local storage and cursors are updated.
- **Input**:

```json
{
  "nowMs": 0,
  "storage": { "type": "datafn.storage.memory" },
  "remote": {
    "cloneResponses": [
      { "ok": true, "result": { "ok": true, "data": { "task": [{ "id": "task:1", "title": "A" }] }, "cursors": { "task": "5" } } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "syncCall", "method": "clone", "payload": { "clientId": "client:1", "tables": ["task"] } },
    { "op": "storageGetRecord", "resource": "task", "id": "task:1" },
    { "op": "storageGetCursor", "resource": "task" },
    { "op": "storageGetHydrationState", "resource": "task" }
  ]
}
```

- **Expected output**:

```json
{
  "results": {
    "storageGetRecord": { "id": "task:1", "title": "A" },
    "storageGetCursor": "5",
    "storageGetHydrationState": "ready"
  }
}
```

- **Negative variant(s)**: N/A

### TV-CLIENT-SYNC-APPLY-002

- **Vector ID**: TV-CLIENT-SYNC-APPLY-002
- **Description**: Cursor updates are monotonic (do not move backwards).
- **Input**:

```json
{
  "nowMs": 0,
  "storage": { "type": "datafn.storage.memory", "state": { "cursors": { "task": "10" }, "hydration": { "task": "ready" } } },
  "remote": {
    "pullResponses": [
      { "ok": true, "result": { "ok": true, "records": { "task": [] }, "deleted": { "task": [] }, "cursors": { "task": "5" } } }
    ]
  },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "syncCall", "method": "pull", "payload": { "clientId": "client:1", "cursors": { "task": "10" } } },
    { "op": "storageGetCursor", "resource": "task" }
  ]
}
```

- **Expected output**:

```json
{ "results": { "storageGetCursor": "10" } }
```

- **Negative variant(s)**: N/A

### TV-HYDRATION-001

- **Vector ID**: TV-HYDRATION-001
- **Description**: Hydration state transitions are recorded during clone application.
- **Input**:

```json
{
  "nowMs": 0,
  "storage": { "type": "datafn.storage.memory", "recordCalls": true },
  "remote": { "cloneResponses": [{ "ok": true, "result": { "ok": true, "data": { "task": [] }, "cursors": { "task": "0" } } }] },
  "ops": [
    { "op": "createClient", "schema": "default", "clientId": "client:1", "storage": "fromInput" },
    { "op": "syncCall", "method": "clone", "payload": { "clientId": "client:1", "tables": ["task"] } }
  ]
}
```

- **Expected output**:

```json
{ "storageCalls": [{ "op": "setHydrationState", "resource": "task", "state": "hydrating" }, { "op": "setHydrationState", "resource": "task", "state": "ready" }] }
```

- **Negative variant(s)**: N/A

### TV-HYDRATION-002

- **Vector ID**: TV-HYDRATION-002
- **Description**: Invalid hydration states are rejected deterministically.
- **Input**:

```json
{ "storage": { "type": "datafn.storage.memory" }, "ops": [{ "op": "setHydrationState", "resource": "task", "state": "wat" }] }
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: invalid hydration state", "details": { "path": "storage.setHydrationState.state" } } }
```

- **Negative variant(s)**: N/A

---

## Extension RPC

### TV-EXT-001

- **Vector ID**: TV-EXT-001
- **Description**: RPC query request/response uses canonical envelope.
- **Input**:

```json
{
  "rpc": { "transport": "inMemoryBus" },
  "messages": [
    {
      "direction": "content->background",
      "message": {
        "id": "r1",
        "method": "query",
        "payload": { "resource": "task", "version": 1, "select": ["id"] }
      }
    },
    {
      "direction": "background->content",
      "message": {
        "id": "r1",
        "envelope": { "ok": true, "result": { "data": [], "nextCursor": null } }
      }
    }
  ]
}
```

- **Expected output**:

```json
{ "ok": true }
```

- **Negative variant(s)**: N/A

### TV-EXT-002

- **Vector ID**: TV-EXT-002
- **Description**: Unknown RPC methods are rejected deterministically.
- **Input**:

```json
{
  "rpc": { "transport": "inMemoryBus" },
  "message": { "id": "r2", "method": "wat", "payload": {} }
}
```

- **Expected output**:

```json
{ "envelope": { "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid RPC: unknown method wat", "details": { "path": "method" } } } }
```

- **Negative variant(s)**: N/A

---

## Tooling (codegen / python / migrations / REST)

### TV-CODEGEN-001

- **Vector ID**: TV-CODEGEN-001
- **Description**: TypeScript codegen output is deterministic for a schema.
- **Input**:

```json
{
  "op": "codegen.ts",
  "schema": "default"
}
```

- **Expected output**:

```json
{
  "file": "datafn.generated.ts",
  "contentsIncludes": [
    "export interface Task",
    "export interface Goal",
    "export type Tables",
    "export type TypedClient"
  ]
}
```

- **Negative variant(s)**: N/A

### TV-CODEGEN-002

- **Vector ID**: TV-CODEGEN-002
- **Description**: Invalid schema input to codegen is rejected.
- **Input**:

```json
{ "op": "codegen.ts", "schema": { "relations": [] } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } } }
```

- **Negative variant(s)**: N/A

### TV-PY-001

- **Vector ID**: TV-PY-001
- **Description**: Python server SDK exposes `/datafn/*` routes.
- **Input**:

```json
{ "op": "python.create_datafn_server", "schema": "default" }
```

- **Expected output**:

```json
{ "routesInclude": ["/datafn/status", "/datafn/query", "/datafn/mutation", "/datafn/transact", "/datafn/seed", "/datafn/clone", "/datafn/pull", "/datafn/push"] }
```

- **Negative variant(s)**: N/A

### TV-PY-002

- **Vector ID**: TV-PY-002
- **Description**: Python server SDK rejects invalid schema deterministically.
- **Input**:

```json
{ "op": "python.create_datafn_server", "schema": { "relations": [] } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } } }
```

- **Negative variant(s)**: N/A

### TV-MIG-001

- **Vector ID**: TV-MIG-001
- **Description**: Migration diff produces deterministic plan for a schema change.
- **Input**:

```json
{
  "op": "migrate.diff",
  "from": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] }], "relations": [] },
  "to": {
    "resources": [
      { "name": "task", "version": 2, "fields": [{ "name": "title", "type": "string", "required": true }, { "name": "done", "type": "boolean", "required": true }] }
    ],
    "relations": []
  }
}
```

- **Expected output**:

```json
{ "plan": { "changes": [{ "kind": "addField", "resource": "task", "field": "done" }] } }
```

- **Negative variant(s)**: N/A

### TV-MIG-002

- **Vector ID**: TV-MIG-002
- **Description**: Invalid diffs are rejected deterministically.
- **Input**:

```json
{
  "op": "migrate.diff",
  "from": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] }], "relations": [] },
  "to": { "relations": [] }
}
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } } }
```

- **Negative variant(s)**: N/A

### TV-REST-001

- **Vector ID**: TV-REST-001
- **Description**: REST query wrapper delegates to DFQL query.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }, "rest": true },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "client:1", "mutationId": "m-rest1", "id": "task:1", "record": { "title": "A" } } },
    { "method": "GET", "path": "/datafn/resources/task?q=%7B%22select%22%3A%5B%22id%22%2C%22title%22%5D%2C%22filters%22%3A%7B%22id%22%3A%22task%3A1%22%7D%7D" }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-rest1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "A" }], "nextCursor": null } }
  ]
}
```

- **Negative variant(s)**: N/A

### TV-REST-002

- **Vector ID**: TV-REST-002
- **Description**: REST wrapper rejects unknown tables deterministically.
- **Input**:

```json
{ "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }, "rest": true }, "request": { "method": "GET", "path": "/datafn/resources/nope" } }
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_RESOURCE", "message": "Unknown resource: nope", "details": { "path": "resource", "resource": "nope" } } }
```

- **Negative variant(s)**: N/A

---

## Documentation (manual verification vectors)

### TV-DOC-001

- **Vector ID**: TV-DOC-001
- **Description**: `@datafn/svelte` README contains an end-to-end example using `createDatafnClient`, `client.task.signal`, and `toSvelteStore`.
- **Input**:

```json
{ "file": "superfunctions/datafn/svelte/README.md", "assertContains": ["createDatafnClient", "client.task.signal", "toSvelteStore"] }
```

- **Expected output**:

```json
{ "ok": true }
```

- **Negative variant(s)**: N/A

### TV-DOC-002

- **Vector ID**: TV-DOC-002
- **Description**: README does not require hand-rolled signals in the primary quick-start.
- **Input**:

```json
{ "file": "superfunctions/datafn/svelte/README.md", "assertNotContainsInQuickStart": ["const signal: DatafnSignal", "function createQuerySignal"] }
```

- **Expected output**:

```json
{ "ok": true }
```

- **Negative variant(s)**: N/A

### TV-DOC-003

- **Vector ID**: TV-DOC-003
- **Description**: A quick-start that requires hand-rolled signals is rejected as non-compliant (negative example).
- **Input**:

```json
{
  "quickStartExcerpt": [
    "import type { DatafnSignal } from \"@datafn/core\";",
    "const signal: DatafnSignal<number> = { get() { return 0; }, subscribe() { return () => {}; } };"
  ]
}
```

- **Expected output**:

```json
{
  "ok": false,
  "error": {
    "code": "DOC_INVALID",
    "message": "Quick Start must use client.<table>.signal(...) (no hand-rolled DatafnSignal)",
    "details": { "path": "README.md#Quick-Start" }
  }
}
```

- **Negative variant(s)**: N/A

