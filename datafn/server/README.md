# @datafn/server

HTTP server implementation for DataFn with query execution, mutations, transactions, and sync.

## Installation

```bash
npm install @datafn/server @datafn/core @superfunctions/http
```

## Features

- **Query Execution**: DFQL query evaluation with filtering, sorting, and pagination
- **Mutations**: Record CRUD with idempotency and optimistic concurrency
- **Transactions**: Atomic multi-step operations with rollback
- **Sync Endpoints**: Clone, pull, push, and seed for offline-first apps
- **Authorization**: Fine-grained per-action authorization hooks
- **Plugins**: Extensible hooks for cross-cutting concerns
- **Limits**: Configurable query and mutation limits

## Quick Start

```typescript
import { createDatafnServer } from "@datafn/server";
import { MemoryAdapter } from "@superfunctions/db"; // or other adapter

const server = await createDatafnServer({
  schema: {
    resources: [
      {
        name: "task",
        version: 1,
        fields: [
          { name: "title", type: "string", required: true },
          { name: "completed", type: "boolean", required: true },
        ],
      },
    ],
  },
  // Use any compatible adapter (e.g., Postgres, SQLite, or Memory for testing)
  db: new MemoryAdapter(), 
  limits: {
    maxLimit: 100,
    maxPayloadBytes: 1048576,
  },
  authorize: async (ctx, action, payload) => {
    // Custom authorization logic
    return true;
  }
});

// Use with your HTTP framework (e.g. via @superfunctions/http-server or generic adapter)
// server.router.handle(request)
```

## API Endpoints

### GET /datafn/status

Returns server status, schema hash, capabilities, and limits.

**Response**:

```json
{
  "ok": true,
  "result": {
    "schemaHash": "abc123...",
    "capabilities": [
      "dfql.query",
      "dfql.mutation",
      "dfql.transact",
      "sync.seed",
      "sync.clone",
      "sync.pull",
      "sync.push"
    ],
    "limits": { "maxLimit": 100 },
    "serverTimeMs": 1234567890
  }
}
```

### POST /datafn/query

Execute DFQL queries with filtering, sorting, and pagination.

**Request**:

```json
{
  "resource": "task",
  "version": 1,
  "select": ["id", "title", "completed"],
  "filters": { "completed": false },
  "sort": ["title:asc"],
  "limit": 10
}
```

**Response**:

```json
{
  "ok": true,
  "result": {
    "data": [{ "id": "task:1", "title": "Buy milk", "completed": false }],
    "nextCursor": null
  }
}
```

### POST /datafn/mutation

Execute mutations with idempotency and optimistic concurrency.

**Request**:

```json
{
  "resource": "task",
  "version": 1,
  "operation": "insert",
  "clientId": "client:device-1",
  "mutationId": "m-123",
  "id": "task:1",
  "record": { "title": "Buy milk", "completed": false }
}
```

**Operations**: `insert`, `merge`, `replace`, `delete`

**Response**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "mutationId": "m-123",
    "affectedIds": ["task:1"],
    "errors": [],
    "deduped": false
  }
}
```

### POST /datafn/transact

Execute atomic transactions with multiple steps.

**Request**:

```json
{
  "transactionId": "tx-1",
  "atomic": true,
  "steps": [
    {
      "query": {
        "resource": "task",
        "select": ["id"],
        "filters": { "completed": false }
      }
    },
    {
      "mutation": {
        "resource": "task",
        "operation": "merge",
        "clientId": "client:1",
        "mutationId": "m-1",
        "id": "task:1",
        "record": { "completed": true }
      }
    }
  ]
}
```

**Response**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "results": [
      { "kind": "query", "ok": true, "result": { "data": [...] } },
      { "kind": "mutation", "ok": true, "result": { ... } }
    ]
  }
}
```

### POST /datafn/clone

Full data sync for initial download.

**Request**:

```json
{
  "version": 1,
  "tables": ["task", "project"]
}
```

**Response**:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "data": {
      "task": [{ "id": "task:1", "title": "..." }],
      "project": [{ "id": "project:1", "name": "..." }]
    },
    "cursors": {
      "task": "5",
      "project": "3"
    }
  }
}
```

### POST /datafn/pull

Incremental sync with cursor-based changes.

**Request**:

```json
{
  "version": 1,
  "cursors": {
    "task": "5",
    "project": "3"
  }
}
```

### POST /datafn/push

Upload local mutations.

**Request**:

```json
{
  "version": 1,
  "mutations": [
    {
      "resource": "task",
      "operation": "insert",
      "clientId": "client:1",
      "mutationId": "m-1",
      "id": "task:new",
      "record": { "title": "New task" }
    }
  ]
}
```

### POST /datafn/seed

Seed data into the database.

**Request**:

```json
{
  "data": {
    "task": [
      { "id": "task:1", "title": "Seeded Task" }
    ]
  }
}
```

## Configuration

```typescript
interface DatafnServerConfig<TContext = any> {
  /** DataFn schema (will be validated at startup) */
  schema: DatafnSchema;

  /** Database adapter (required for persistence) */
  db?: Adapter;

  /** Optional plugins */
  plugins?: DatafnPlugin[];

  /** Optional authorization callback */
  authorize?: (
    ctx: TContext,
    action:
      | "status"
      | "query"
      | "mutation"
      | "transact"
      | "seed"
      | "clone"
      | "pull"
      | "push",
    payload: unknown,
  ) => Promise<boolean> | boolean;

  /** Optional limits configuration */
  limits?: {
    maxLimit?: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
  };

  /** Optional server time provider (for testing) */
  getServerTime?: () => number;
}
```

## Query Features

- **Filtering**: Operators (eq, ne, gt, gte, lt, lte, like, ilike, is_null, is_not_null)
- **Logical Groups**: $and, $or
- **Sorting**: Multi-field with asc/desc, deterministic tie-breaking
- **Pagination**: Limit/offset and cursor-based
- **Relations**: Automatic expansion of many-one and many-many relations

## Mutation Features

- **Idempotency**: (clientId, mutationId) deduplication
- **Optimistic Concurrency**: `if` guards for conflict prevention
- **Operations**: insert, merge, replace, delete
- **Relation Ops**: relate, modifyRelation, unrelate

## License

MIT