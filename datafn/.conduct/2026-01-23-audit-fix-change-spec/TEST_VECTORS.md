## datafn — Audit Fix Change Spec Test Vectors

These vectors define the deterministic “golden” inputs/outputs required by `REQUIREMENTS.md`.

Notes:

- “Request” vectors use the HTTP transport envelope: all responses are `DatafnEnvelope`.
- Some vectors are “manual review” for documentation; those specify objective, greppable acceptance checks.

---

## Core

### TV-CORE-ENV-001

- **Vector ID**: TV-CORE-ENV-001
- **Description**: `DatafnEnvelope` success shape is stable and unambiguous.
- **Input**:

```json
{ "envelope": { "ok": true, "result": { "x": 1 } } }
```

- **Expected output**:

```json
{ "unwrap": { "x": 1 } }
```

- **Negative variant(s)**:
  - See `TV-CORE-UTIL-002`.

### TV-CORE-EVENT-001

- **Vector ID**: TV-CORE-EVENT-001
- **Description**: Event/filter supports action/fields/contextKeys (positive match).
- **Input**:

```json
{
  "event": {
    "type": "mutation_applied",
    "resource": "task",
    "ids": ["task:1"],
    "mutationId": "m-1",
    "clientId": "client:1",
    "timestampMs": 1,
    "action": "merge",
    "fields": ["title"],
    "context": { "source": "ui", "traceId": "t-1" }
  },
  "filter": {
    "type": "mutation_applied",
    "action": ["merge", "insert"],
    "fields": ["title", "done"],
    "contextKeys": ["traceId"]
  }
}
```

- **Expected output**:

```json
{ "matches": true }
```

- **Negative variant(s)**:
  - See `TV-CORE-EVENT-002`.

### TV-CORE-EVENT-002

- **Vector ID**: TV-CORE-EVENT-002
- **Description**: contextKeys requires presence; missing key does not match.
- **Input**:

```json
{
  "event": {
    "type": "mutation_applied",
    "timestampMs": 1,
    "context": { "source": "ui" }
  },
  "filter": { "contextKeys": ["traceId"] }
}
```

- **Expected output**:

```json
{ "matches": false }
```

### TV-CORE-UTIL-001

- **Vector ID**: TV-CORE-UTIL-001
- **Description**: `unwrapEnvelope` returns result for ok:true.
- **Input**:

```json
{ "envelope": { "ok": true, "result": 123 } }
```

- **Expected output**:

```json
{ "value": 123 }
```

### TV-CORE-UTIL-002

- **Vector ID**: TV-CORE-UTIL-002
- **Description**: `unwrapEnvelope` throws/returns the exact error for ok:false.
- **Input**:

```json
{
  "envelope": {
    "ok": false,
    "error": { "code": "SCHEMA_INVALID", "message": "Invalid schema", "details": { "path": "resources" } }
  }
}
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "message": "Invalid schema", "details": { "path": "resources" } } }
```

---

## Server (envelopes / validation / db / status / auth)

### TV-SERVER-ENV-OK-001

- **Vector ID**: TV-SERVER-ENV-OK-001
- **Description**: A valid query request returns a top-level ok:true envelope.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": {
    "method": "POST",
    "path": "/datafn/query",
    "body": { "resource": "task", "version": 1, "select": ["id"], "filters": { "id": "task:1" } }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

- **Negative variant(s)**: N/A

### TV-SERVER-ENV-001

- **Vector ID**: TV-SERVER-ENV-001
- **Description**: Invalid JSON is a top-level ok:false envelope (not nested).
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

### TV-SERVER-ENV-002-POS

- **Vector ID**: TV-SERVER-ENV-002-POS
- **Description**: Valid JSON on clone yields ok:true envelope.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:1", "tables": ["task"] } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "ok": true, "data": { "task": [] }, "cursors": { "task": "0" } } }
```

### TV-SERVER-VALID-001

- **Vector ID**: TV-SERVER-VALID-001
- **Description**: Unknown resource yields deterministic DFQL_UNKNOWN_RESOURCE at request level.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "nope", "version": 1 } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_RESOURCE", "message": "Unknown resource: nope", "details": { "path": "resource" } } }
```

### TV-SERVER-VALID-002

- **Vector ID**: TV-SERVER-VALID-002
- **Description**: Missing required field yields deterministic DFQL_INVALID at request level.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "version": 1 } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: resource must be string", "details": { "path": "resource" } } }
```

### TV-DB-INIT-001

- **Vector ID**: TV-DB-INIT-001
- **Description**: Server initializes DB and can persist records.
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
        "operation": "insert",
        "clientId": "client:1",
        "mutationId": "m-1",
        "id": "task:1",
        "record": { "title": "A" }
      }
    },
    { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id", "title"], "filters": { "id": "task:1" } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"], "errors": [], "deduped": false } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "A" }], "nextCursor": null } }
  ]
}
```

### TV-DB-MISSING-001

- **Vector ID**: TV-DB-MISSING-001
- **Description**: Missing DB makes non-status endpoints return deterministic INTERNAL.
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

### TV-STATUS-002

- **Vector ID**: TV-STATUS-002
- **Description**: Unhealthy DB makes `/datafn/status` return ok:false INTERNAL.
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

### TV-AUTH-001

- **Vector ID**: TV-AUTH-001
- **Description**: Authorization receives the parsed request payload (not null).
- **Input**:

```json
{
  "server": { "authorize": "capturePayload" },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "observability": { "authorizeCalls": [{ "action": "query", "payload": { "resource": "task", "version": 1, "select": ["id"] } }] } }
```

### TV-AUTH-002

- **Vector ID**: TV-AUTH-002
- **Description**: Denied authorization yields ok:false FORBIDDEN.
- **Input**:

```json
{
  "server": { "authorize": "denyAll" },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1 } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "$" } } }
```

---

## Server plugins

### TV-PLUG-SERVER-ORDER-001

- **Vector ID**: TV-PLUG-SERVER-ORDER-001
- **Description**: Server plugins run in registration order and beforeQuery can transform queries deterministically.
- **Input**:

```json
{
  "server": {
    "plugins": [
      { "name": "p1", "runsOn": ["server"], "beforeQuery": "addFilterIsArchivedFalse" },
      { "name": "p2", "runsOn": ["server"], "beforeQuery": "addSortIdAsc" }
    ]
  },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

### TV-PLUG-SERVER-RUNSON-001

- **Vector ID**: TV-PLUG-SERVER-RUNSON-001
- **Description**: Plugins without `"server"` in runsOn do not run on the server.
- **Input**:

```json
{
  "server": { "plugins": [{ "name": "p1", "runsOn": ["client"], "beforeQuery": "throwForbidden" }] },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1 } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

### TV-PLUG-SERVER-AFTERQUERY-001

- **Vector ID**: TV-PLUG-SERVER-AFTERQUERY-001
- **Description**: afterQuery runs for DB-backed queries and can deterministically transform results.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }, "plugins": [{ "name": "p1", "runsOn": ["server"], "afterQuery": "appendMarker" }] },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null, "marker": "p1" } }
```

### TV-PLUG-SERVER-AFTERQUERY-002

- **Vector ID**: TV-PLUG-SERVER-AFTERQUERY-002
- **Description**: afterQuery failures are fail-open (response still returned).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" }, "plugins": [{ "name": "p1", "runsOn": ["server"], "afterQuery": "throwInternal" }] },
  "request": { "method": "POST", "path": "/datafn/query", "body": { "resource": "task", "version": 1, "select": ["id"] } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

---

## Server sync ordering / idempotency / seed

### TV-SERVERSEQ-001

- **Vector ID**: TV-SERVERSEQ-001
- **Description**: serverSeq is monotonic under concurrent mutation application (positive).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "concurrent": true, "count": 10, "request": { "method": "POST", "path": "/datafn/mutation", "bodyTemplate": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-${i}", "id": "task:1", "record": { "title": "T${i}" } } } }
  ]
}
```

- **Expected output**:

```json
{ "observability": { "serverSeqs": { "unique": true, "count": 10 } } }
```

### TV-SERVERSEQ-002

- **Vector ID**: TV-SERVERSEQ-002
- **Description**: serverSeq does not derive from client timestamps (negative).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "c1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" }, "timestamp": 999999999 } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "c2", "mutationId": "m-2", "id": "task:1", "record": { "title": "B" }, "timestamp": 0 } }
  ]
}
```

- **Expected output**:

```json
{ "observability": { "finalTitle": "B" } }
```

### TV-SYNC-CLONE-001

- **Vector ID**: TV-SYNC-CLONE-001
- **Description**: Clone returns deterministic snapshot ordered by id and cursors as serverSeq strings.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "setup": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "c1", "mutationId": "m-1", "id": "task:2", "record": { "title": "B" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "insert", "clientId": "c1", "mutationId": "m-2", "id": "task:1", "record": { "title": "A" } } }
  ],
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:1", "tables": ["task"] } }
}
```

- **Expected output**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "data": { "task": [{ "id": "task:1", "title": "A" }, { "id": "task:2", "title": "B" }] },
    "cursors": { "task": "2" }
  }
}
```

### TV-SYNC-CLONE-002

- **Vector ID**: TV-SYNC-CLONE-002
- **Description**: Remote-only table cannot be cloned (negative).
- **Input**:

```json
{
  "server": { "schema": { "resources": [{ "name": "remote", "version": 1, "isRemoteOnly": true, "fields": [{ "name": "label", "type": "string", "required": true }] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/clone", "body": { "clientId": "client:1", "tables": ["remote"] } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: remote-only table cannot be cloned: remote", "details": { "path": "tables" } } }
```

### TV-IDEMP-001

- **Vector ID**: TV-IDEMP-001
- **Description**: Idempotency dedupe survives restart with preserved adapter state (positive).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn", "preserveStateAcrossRestart": true } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-idem", "id": "task:1", "record": { "title": "B" } } },
    { "op": "serverRestart" },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-idem", "id": "task:1", "record": { "title": "B" } } }
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

### TV-IDEMP-002

- **Vector ID**: TV-IDEMP-002
- **Description**: Idempotency keys are scoped to clientId (negative for incorrect cross-client dedupe).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "client:2", "mutationId": "m-1", "id": "task:2", "record": { "title": "B" } } }
  ]
}
```

- **Expected output**:

```json
{ "observability": { "dedupedFlags": [false, false] } }
```

### TV-SEED-001

- **Vector ID**: TV-SEED-001
- **Description**: Seed accepts clientId and returns ok:true result.
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/seed", "body": { "clientId": "client:device-1" } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "ok": true } }
```

### TV-SEED-002

- **Vector ID**: TV-SEED-002
- **Description**: Missing/invalid clientId is rejected (negative).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "POST", "path": "/datafn/seed", "body": {} }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: clientId must be string", "details": { "path": "clientId" } } }
```

### TV-PUSH-CLIENTID-001

- **Vector ID**: TV-PUSH-CLIENTID-001
- **Description**: Push accepts consistent clientId across request and items (positive).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": {
    "method": "POST",
    "path": "/datafn/push",
    "body": { "clientId": "client:1", "mutations": [{ "resource": "task", "version": 1, "operation": "merge", "clientId": "client:1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" } }] }
  }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "ok": true, "applied": ["m-1"], "errors": [] } }
```

### TV-PUSH-CLIENTID-002

- **Vector ID**: TV-PUSH-CLIENTID-002
- **Description**: Push rejects mismatched item clientId (negative).
- **Input**:

```json
{
  "server": { "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": {
    "method": "POST",
    "path": "/datafn/push",
    "body": { "clientId": "client:1", "mutations": [{ "resource": "task", "version": 1, "operation": "merge", "clientId": "client:2", "mutationId": "m-1", "id": "task:1", "record": { "title": "A" } }] }
  }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: push.mutations[0].clientId must equal request.clientId", "details": { "path": "mutations[0].clientId" } } }
```

---

## REST wrappers

### TV-REST-VERSION-001

- **Vector ID**: TV-REST-VERSION-001
- **Description**: REST wrapper injects schema version (positive).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 7, "fields": [{ "name": "title", "type": "string", "required": true }] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "GET", "path": "/datafn/resources/task", "query": { "q": "{\"select\":[\"id\"]}" } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

### TV-REST-VERSION-002

- **Vector ID**: TV-REST-VERSION-002
- **Description**: REST wrapper rejects unknown table (negative).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "GET", "path": "/datafn/resources/nope" }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_UNKNOWN_RESOURCE", "message": "Unknown resource: nope", "details": { "path": "resource" } } }
```

### TV-REST-META-001

- **Vector ID**: TV-REST-META-001
- **Description**: REST mutation wrapper accepts explicit clientId/mutationId (positive).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "DELETE", "path": "/datafn/resources/task/task:1", "query": { "clientId": "client:1", "mutationId": "m-del-1" } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "ok": true, "mutationId": "m-del-1", "affectedIds": ["task:1"] } }
```

### TV-REST-META-002

- **Vector ID**: TV-REST-META-002
- **Description**: REST mutation wrapper rejects missing mutationId (negative).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "DELETE", "path": "/datafn/resources/task/task:1", "query": { "clientId": "client:1" } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: mutationId is required", "details": { "path": "mutationId" } } }
```

### TV-REST-QUERY-001

- **Vector ID**: TV-REST-QUERY-001
- **Description**: REST GET parses q and delegates to query (positive).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "GET", "path": "/datafn/resources/task", "query": { "q": "{\"select\":[\"id\"],\"filters\":{\"id\":\"task:1\"}}" } }
}
```

- **Expected output**:

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

### TV-REST-QUERY-002

- **Vector ID**: TV-REST-QUERY-002
- **Description**: Invalid q JSON is rejected deterministically (negative).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "request": { "method": "GET", "path": "/datafn/resources/task", "query": { "q": "not-json" } }
}
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": { "path": "q" } } }
```

### TV-REST-POST-DEFAULT-001

- **Vector ID**: TV-REST-POST-DEFAULT-001
- **Description**: POST defaults to merge (upsert) when operation is absent (positive).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": false }, { "name": "done", "type": "boolean", "required": false }] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/resources/task", "query": { "clientId": "client:1", "mutationId": "m-1" }, "body": { "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/resources/task", "query": { "clientId": "client:1", "mutationId": "m-2" }, "body": { "id": "task:1", "record": { "done": true } } },
    { "method": "GET", "path": "/datafn/resources/task", "query": { "q": "{\"filters\":{\"id\":\"task:1\"},\"select\":[\"id\",\"title\",\"done\"]}" } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"] } },
    { "ok": true, "result": { "ok": true, "mutationId": "m-2", "affectedIds": ["task:1"] } },
    { "ok": true, "result": { "data": [{ "id": "task:1", "title": "A", "done": true }], "nextCursor": null } }
  ]
}
```

### TV-REST-POST-DEFAULT-002

- **Vector ID**: TV-REST-POST-DEFAULT-002
- **Description**: Explicit insert on an existing id fails deterministically (negative).
- **Input**:

```json
{
  "server": { "rest": true, "schema": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": false }] }], "relations": [] }, "db": { "type": "superfunctions.db.memoryAdapter", "libraryNamespace": "datafn" } },
  "requests": [
    { "method": "POST", "path": "/datafn/resources/task", "query": { "clientId": "client:1", "mutationId": "m-1" }, "body": { "operation": "insert", "id": "task:1", "record": { "title": "A" } } },
    { "method": "POST", "path": "/datafn/resources/task", "query": { "clientId": "client:1", "mutationId": "m-2" }, "body": { "operation": "insert", "id": "task:1", "record": { "title": "B" } } }
  ]
}
```

- **Expected output**:

```json
{
  "responses": [
    { "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["task:1"] } },
    { "ok": true, "result": { "ok": false, "mutationId": "m-2", "affectedIds": [], "errors": [{ "code": "CONFLICT", "message": "Conflict", "path": "id" }] } }
  ]
}
```

---

## Client plugins / events / filters / signals

### TV-PLUG-CLIENT-001

- **Vector ID**: TV-PLUG-CLIENT-001
- **Description**: Client beforeQuery plugin transforms outgoing query deterministically.
- **Input**:

```json
{
  "client": { "plugins": [{ "name": "p1", "runsOn": ["client"], "beforeQuery": "addFilterIsArchivedFalse" }] },
  "call": { "method": "client.task.query", "args": [{ "select": ["id"] }] }
}
```

- **Expected output**:

```json
{ "observability": { "remote.query.calledWith": { "filters": { "isArchived": false } } } }
```

### TV-PLUG-CLIENT-002

- **Vector ID**: TV-PLUG-CLIENT-002
- **Description**: beforeQuery failures are fail-closed and prevent remote calls.
- **Input**:

```json
{
  "client": { "plugins": [{ "name": "p1", "runsOn": ["client"], "beforeQuery": "throwForbidden" }] },
  "call": { "method": "client.task.query", "args": [{ "select": ["id"] }] }
}
```

- **Expected output**:

```json
{ "throws": { "code": "FORBIDDEN", "message": "Forbidden", "details": { "path": "plugins.p1.beforeQuery" } }, "observability": { "remote.query.callCount": 0 } }
```

### TV-CLIENT-EVENT-001

- **Vector ID**: TV-CLIENT-EVENT-001
- **Description**: mutation_applied includes action + fields (positive).
- **Input**:

```json
{
  "call": {
    "method": "client.task.mutate",
    "args": [{ "operation": "merge", "clientId": "client:1", "mutationId": "m-1", "id": "task:1", "record": { "title": "A", "done": true } }]
  }
}
```

- **Expected output**:

```json
{ "observability": { "event": { "type": "mutation_applied", "action": "merge", "fields": ["done", "title"] } } }
```

### TV-CLIENT-EVENT-002

- **Vector ID**: TV-CLIENT-EVENT-002
- **Description**: Thrown remote errors still emit mutation_rejected (negative).
- **Input**:

```json
{
  "remote": { "mutation": "throwsNetworkDown" },
  "call": {
    "method": "client.task.mutate",
    "args": [{ "operation": "merge", "clientId": "client:1", "mutationId": "m-err", "id": "task:1", "record": { "title": "A" } }]
  }
}
```

- **Expected output**:

```json
{ "throws": { "code": "TRANSPORT_ERROR" }, "observability": { "event": { "type": "mutation_rejected", "mutationId": "m-err" } } }
```

### TV-CLIENT-FILTER-001

- **Vector ID**: TV-CLIENT-FILTER-001
- **Description**: fields filter matches on intersection (positive).
- **Input**:

```json
{
  "event": { "type": "mutation_applied", "timestampMs": 1, "fields": ["title"] },
  "filter": { "fields": ["done", "title"] }
}
```

- **Expected output**:

```json
{ "matches": true }
```

### TV-CLIENT-FILTER-002

- **Vector ID**: TV-CLIENT-FILTER-002
- **Description**: fields filter does not match when no intersection (negative).
- **Input**:

```json
{
  "event": { "type": "mutation_applied", "timestampMs": 1, "fields": ["title"] },
  "filter": { "fields": ["done"] }
}
```

- **Expected output**:

```json
{ "matches": false }
```

### TV-CLIENT-SIGNAL-001

- **Vector ID**: TV-CLIENT-SIGNAL-001
- **Description**: Signals are cached by canonical dfqlKey and preserve object identity (positive).
- **Input**:

```json
{
  "calls": [
    { "method": "client.task.signal", "args": [{ "select": ["id"], "filters": { "isArchived": false } }] },
    { "method": "client.task.signal", "args": [{ "filters": { "isArchived": false }, "select": ["id"] }] }
  ]
}
```

- **Expected output**:

```json
{ "observability": { "sameObjectIdentity": true } }
```

### TV-CLIENT-SIGNAL-002

- **Vector ID**: TV-CLIENT-SIGNAL-002
- **Description**: dfqlKey usage is delegated to @datafn/core (negative if not).
- **Input**:

```json
{ "observability": { "spyOn": "@datafn/core.dfqlKey" }, "call": { "method": "client.task.signal", "args": [{ "select": ["id"] }] } }
```

- **Expected output**:

```json
{ "observability": { "core.dfqlKey.callCountAtLeast": 1 } }
```

---

## Storage adapters / offline behavior

### TV-STORAGE-MEM-001

- **Vector ID**: TV-STORAGE-MEM-001
- **Description**: Memory adapter persists records deterministically and dedupes changelog (positive).
- **Input**:

```json
{
  "adapter": "memory",
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:2", "title": "B" } },
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "listRecords", "resource": "task" },
    { "op": "changelogAppend", "entry": { "clientId": "c1", "mutationId": "m1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogAppend", "entry": { "clientId": "c1", "mutationId": "m1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{
  "results": [
    { "records": [{ "id": "task:1", "title": "A" }, { "id": "task:2", "title": "B" }] },
    { "changelogLength": 1 }
  ]
}
```

### TV-STORAGE-MEM-002

- **Vector ID**: TV-STORAGE-MEM-002
- **Description**: Invalid hydration state is rejected deterministically (negative).
- **Input**:

```json
{ "adapter": "memory", "op": "setHydrationState", "resource": "task", "state": "wat" }
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: invalid hydration state", "details": { "path": "storage.setHydrationState.state" } } }
```

### TV-STORAGE-IDB-001

- **Vector ID**: TV-STORAGE-IDB-001
- **Description**: IndexedDB adapter persists across re-instantiation (positive).
- **Input**:

```json
{
  "adapter": "indexeddb",
  "dbName": "datafn-test",
  "ops": [
    { "op": "upsertRecord", "resource": "task", "record": { "id": "task:1", "title": "A" } },
    { "op": "recreateAdapter" },
    { "op": "getRecord", "resource": "task", "id": "task:1" }
  ]
}
```

- **Expected output**:

```json
{ "record": { "id": "task:1", "title": "A" } }
```

### TV-STORAGE-IDB-002

- **Vector ID**: TV-STORAGE-IDB-002
- **Description**: Adapter rejects invalid inputs deterministically (negative).
- **Input**:

```json
{ "adapter": "indexeddb", "op": "getRecord", "resource": 123, "id": "task:1" }
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: invalid resource", "details": { "path": "storage.resource" } } }
```

### TV-OFFLINE-QUERY-001

- **Vector ID**: TV-OFFLINE-QUERY-001
- **Description**: Hydration ready routes queries locally (positive).
- **Input**:

```json
{
  "client": { "storage": "memory", "hydration": { "task": "ready" }, "records": { "task": [{ "id": "task:1", "title": "Local" }] } },
  "remote": { "query": "countCalls" },
  "call": { "method": "client.task.query", "args": [{ "select": ["id", "title"], "filters": { "id": "task:1" } }] }
}
```

- **Expected output**:

```json
{ "result": { "data": [{ "id": "task:1", "title": "Local" }], "nextCursor": null }, "observability": { "remote.query.callCount": 0 } }
```

### TV-OFFLINE-QUERY-002

- **Vector ID**: TV-OFFLINE-QUERY-002
- **Description**: Hydration hydrating routes queries remotely (negative for local-first).
- **Input**:

```json
{
  "client": { "storage": "memory", "hydration": { "task": "hydrating" } },
  "remote": { "query": "returnsRemote" },
  "call": { "method": "client.task.query", "args": [{ "select": ["id"], "filters": { "id": "task:1" } }] }
}
```

- **Expected output**:

```json
{ "observability": { "remote.query.callCountAtLeast": 1 } }
```

### TV-OFFLINE-MUT-001

- **Vector ID**: TV-OFFLINE-MUT-001
- **Description**: Remote transport failure triggers changelog append + optimistic local write (positive).
- **Input**:

```json
{
  "client": { "storage": "memory", "clientId": "client:1" },
  "remote": { "mutation": "throwsNetworkDown" },
  "call": { "method": "client.task.mutate", "args": [{ "operation": "merge", "clientId": "client:1", "mutationId": "m-off-1", "id": "task:1", "record": { "id": "task:1", "title": "Offline" } }] }
}
```

- **Expected output**:

```json
{ "result": { "ok": true, "mutationId": "m-off-1", "affectedIds": ["task:1"] }, "observability": { "storage.record.task:1.title": "Offline", "storage.changelog.length": 1 } }
```

### TV-OFFLINE-MUT-002

- **Vector ID**: TV-OFFLINE-MUT-002
- **Description**: If changelog append fails, offline mutation fails deterministically (negative).
- **Input**:

```json
{
  "client": { "storage": "memory", "storageFault": "changelogAppendFails", "clientId": "client:1" },
  "remote": { "mutation": "throwsNetworkDown" },
  "call": { "method": "client.task.mutate", "args": [{ "operation": "merge", "clientId": "client:1", "mutationId": "m-off-2", "id": "task:1", "record": { "title": "X" } }] }
}
```

- **Expected output**:

```json
{ "throws": { "code": "INTERNAL", "message": "Storage error: changelogAppend failed", "details": { "path": "storage.changelogAppend" } } }
```

### TV-CHANGELOG-001

- **Vector ID**: TV-CHANGELOG-001
- **Description**: Changelog dedupes by (clientId, mutationId) (positive).
- **Input**:

```json
{
  "storage": "memory",
  "ops": [
    { "op": "changelogAppend", "entry": { "clientId": "c1", "mutationId": "m1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogAppend", "entry": { "clientId": "c1", "mutationId": "m1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{ "changelogLength": 1 }
```

### TV-CHANGELOG-002

- **Vector ID**: TV-CHANGELOG-002
- **Description**: changelogAck removes entries deterministically (negative for “not removed”).
- **Input**:

```json
{
  "storage": "memory",
  "ops": [
    { "op": "changelogAppend", "entry": { "clientId": "c1", "mutationId": "m1", "mutation": { "id": "task:1" }, "timestampMs": 0 } },
    { "op": "changelogAck", "throughSeq": 1 },
    { "op": "changelogList" }
  ]
}
```

- **Expected output**:

```json
{ "changelogLength": 0 }
```

---

## Extension RPC

### TV-EXT-001

- **Vector ID**: TV-EXT-001
- **Description**: RPC query request/response uses canonical envelopes (positive).
- **Input**:

```json
{
  "transport": "extension",
  "call": { "method": "remote.query", "args": [{ "resource": "task", "version": 1, "select": ["id"] }] },
  "backgroundResponse": { "envelope": { "ok": true, "result": { "data": [], "nextCursor": null } } }
}
```

- **Expected output**:

```json
{ "resolved": { "ok": true, "result": { "data": [], "nextCursor": null } } }
```

### TV-EXT-002

- **Vector ID**: TV-EXT-002
- **Description**: Subscription event forwarding uses DatafnRpcEvent (negative if missing).
- **Input**:

```json
{
  "transport": "extension",
  "backgroundEvent": { "type": "event", "subscriptionId": "sub-1", "event": { "type": "mutation_applied", "timestampMs": 1, "resource": "task", "ids": ["task:1"] } }
}
```

- **Expected output**:

```json
{ "observability": { "deliveredToSubscribers": true } }
```

---

## CLI / codegen / migrations

### TV-CLI-VALIDATE-001

- **Vector ID**: TV-CLI-VALIDATE-001
- **Description**: CLI validation rejects invalid schema deterministically (positive).
- **Input**:

```json
{ "schema": { "relations": [] } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "details": { "path": "resources" } } }
```

### TV-CLI-VALIDATE-002

- **Vector ID**: TV-CLI-VALIDATE-002
- **Description**: Valid schema passes validation (negative for “reject valid”).
- **Input**:

```json
{ "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] } }
```

- **Expected output**:

```json
{ "ok": true }
```

### TV-CODEGEN-001

- **Vector ID**: TV-CODEGEN-001
- **Description**: Codegen output ordering is deterministic (positive).
- **Input**:

```json
{
  "schema": {
    "resources": [
      { "name": "task", "version": 1, "fields": [{ "name": "id", "type": "string", "required": true }, { "name": "title", "type": "string", "required": true }] },
      { "name": "goal", "version": 1, "fields": [{ "name": "id", "type": "string", "required": true }] }
    ],
    "relations": []
  }
}
```

- **Expected output**:

```json
{ "outputContains": ["export interface Goal", "export interface Task", "export interface Tables", "export type TypedClient"] }
```

### TV-CODEGEN-002

- **Vector ID**: TV-CODEGEN-002
- **Description**: Codegen rejects invalid schema deterministically (negative).
- **Input**:

```json
{ "schema": { "relations": [] } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "details": { "path": "resources" } } }
```

### TV-MIG-001

- **Vector ID**: TV-MIG-001
- **Description**: Migration plan is deterministic for a field addition (positive).
- **Input**:

```json
{
  "from": { "resources": [{ "name": "task", "version": 1, "fields": [{ "name": "title", "type": "string", "required": true }] }], "relations": [] },
  "to": { "resources": [{ "name": "task", "version": 2, "fields": [{ "name": "title", "type": "string", "required": true }, { "name": "done", "type": "boolean", "required": true }] }], "relations": [] }
}
```

- **Expected output**:

```json
{ "plan": { "changes": [{ "kind": "addField", "resource": "task", "field": "done", "type": "boolean", "required": true }] } }
```

### TV-MIG-002

- **Vector ID**: TV-MIG-002
- **Description**: Migration diff rejects invalid schema deterministically (negative).
- **Input**:

```json
{ "from": { "resources": [{ "name": "task", "version": 1, "fields": [] }] }, "to": { "relations": [] } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "details": { "path": "resources" } } }
```

---

## Python SDK

### TV-PY-001

- **Vector ID**: TV-PY-001
- **Description**: Python SDK exposes /datafn/* routes (positive).
- **Input**:

```json
{ "python": { "schema": { "resources": [{ "name": "task", "version": 1, "fields": [] }], "relations": [] } } }
```

- **Expected output**:

```json
{ "routesInclude": ["/datafn/status", "/datafn/query", "/datafn/mutation", "/datafn/transact", "/datafn/seed", "/datafn/clone", "/datafn/pull", "/datafn/push"] }
```

### TV-PY-002

- **Vector ID**: TV-PY-002
- **Description**: Python SDK rejects invalid schema deterministically (negative).
- **Input**:

```json
{ "python": { "schema": { "relations": [] } } }
```

- **Expected output**:

```json
{ "throws": { "code": "SCHEMA_INVALID", "message": "Invalid schema: missing resources", "details": { "path": "resources" } } }
```

### TV-PY-PARITY-001

- **Vector ID**: TV-PY-PARITY-001
- **Description**: Python endpoint invalid JSON yields DFQL_INVALID "Invalid JSON" (positive).
- **Input**:

```json
{ "python": { "request": { "method": "POST", "path": "/datafn/query", "rawBody": "{", "headers": { "content-type": "application/json" } } } }
```

- **Expected output**:

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": { "path": "$" } } }
```

### TV-PY-PARITY-002

- **Vector ID**: TV-PY-PARITY-002
- **Description**: Python idempotency does not dedupe across different clientId (negative).
- **Input**:

```json
{
  "python": {
    "requests": [
      { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "c1", "mutationId": "m1", "id": "task:1", "record": { "title": "A" } } },
      { "method": "POST", "path": "/datafn/mutation", "body": { "resource": "task", "version": 1, "operation": "merge", "clientId": "c2", "mutationId": "m1", "id": "task:2", "record": { "title": "B" } } }
    ]
  }
}
```

- **Expected output**:

```json
{ "observability": { "dedupedFlags": [false, false] } }
```

---

## Documentation (manual review)

### TV-DOCS-SVELTE-001

- **Vector ID**: TV-DOCS-SVELTE-001
- **Description**: `@datafn/svelte` README contains an end-to-end example using `createDatafnClient`, `client.<table>.signal`, and `toSvelteStore` (positive).
- **Input**:

```json
{ "file": "svelte/README.md", "mustContainAll": ["createDatafnClient", ".signal(", "toSvelteStore("] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-SVELTE-002

- **Vector ID**: TV-DOCS-SVELTE-002
- **Description**: `@datafn/svelte` README does not present hand-rolled signal creation as the primary path (negative).
- **Input**:

```json
{ "file": "svelte/README.md", "mustNotContainPrimaryExample": ["const signal: DatafnSignal", "function createQuerySignal("] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-CLIENT-001

- **Vector ID**: TV-DOCS-CLIENT-001
- **Description**: `@datafn/client` README documents `remote` config and current API (positive).
- **Input**:

```json
{ "file": "client/README.md", "mustContainAll": ["remote:", "client.table(", "client.sync.", ".signal("] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-CLIENT-002

- **Vector ID**: TV-DOCS-CLIENT-002
- **Description**: `@datafn/client` README does not document obsolete `executor` config (negative).
- **Input**:

```json
{ "file": "client/README.md", "mustNotContain": ["executor:"] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-CORE-001

- **Vector ID**: TV-DOCS-CORE-001
- **Description**: `@datafn/core` README documents `validateSchema` as envelope-returning and documents `unwrapEnvelope` (positive).
- **Input**:

```json
{ "file": "core/README.md", "mustContainAll": ["validateSchema(", "DatafnEnvelope", "unwrapEnvelope"] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-CORE-002

- **Vector ID**: TV-DOCS-CORE-002
- **Description**: `@datafn/core` README does not claim validateSchema throws (negative).
- **Input**:

```json
{ "file": "core/README.md", "mustNotContain": ["Validates a schema and returns the validated result or throws"] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-SERVER-001

- **Vector ID**: TV-DOCS-SERVER-001
- **Description**: `@datafn/server` README uses `@superfunctions/db.Adapter` and canonical capability strings (positive).
- **Input**:

```json
{ "file": "server/README.md", "mustContainAll": ["@superfunctions/db", "sync.seed", "sync.clone", "sync.pull", "sync.push"] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

### TV-DOCS-SERVER-002

- **Vector ID**: TV-DOCS-SERVER-002
- **Description**: `@datafn/server` README does not present `MemoryStore` as the primary integration (negative).
- **Input**:

```json
{ "file": "server/README.md", "mustNotContainPrimaryExample": ["new MemoryStore"] }
```

- **Expected output**:

```json
{ "manualReview": "PASS" }
```

