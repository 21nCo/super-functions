# @datafn/core

Core types, schema validation, and DFQL normalization for DataFn.

## Installation

```bash
npm install @datafn/core
```

## Features

- **Type Definitions**: Complete TypeScript types for schemas, events, signals, and plugins
- **Schema Validation**: Runtime validation of DataFn schemas
- **DFQL Normalization**: Deterministic normalization for cache keys
- **Error Handling**: Structured error types with envelopes

## API

### Types

#### DatafnSchema

```typescript
type DatafnSchema = {
  resources: DatafnResourceSchema[];
  relations?: DatafnRelationSchema[];
};
```

Defines the complete data model including resources (tables) and their relationships.

#### DatafnResourceSchema

```typescript
type DatafnResourceSchema = {
  name: string;
  version: number;
  fields: DatafnFieldSchema[];
  idPrefix?: string;
  isRemoteOnly?: boolean;
  indices?:
    | { base?: string[]; search?: string[]; vector?: string[] }
    | string[];
};
```

Defines a resource (table) with fields, version, and optional indices.

#### DatafnEvent

```typescript
interface DatafnEvent {
  type:
    | "mutation_applied"
    | "mutation_rejected"
    | "sync_applied"
    | "sync_failed";
  resource?: string;
  ids?: string[];
  mutationId?: string;
  clientId?: string;
  timestampMs: number;
  context?: unknown;
  action?: string;
  fields?: string[];
}
```

Event structure for mutation and sync operations.

#### DatafnPlugin & DatafnHookContext

```typescript
type DatafnHookContext = {
  env: "client" | "server";
  schema: DatafnSchema;
  context?: unknown;
};

interface DatafnPlugin {
  name: string;
  runsOn: Array<"client" | "server">;
  beforeQuery?: (ctx: DatafnHookContext, q: unknown) => Promise<unknown> | unknown;
  afterQuery?: (ctx: DatafnHookContext, q: unknown, result: unknown) => Promise<unknown> | unknown;
  beforeMutation?: (ctx: DatafnHookContext, m: unknown) => Promise<unknown> | unknown;
  afterMutation?: (ctx: DatafnHookContext, m: unknown, result: unknown) => Promise<void> | void;
  // ... hooks for sync (beforeSync, afterSync)
}
```

Plugins allow intercepting and modifying queries, mutations, and sync operations.

### Functions

#### validateSchema(schema: unknown): DatafnEnvelope<DatafnSchema>

```typescript
import { validateSchema, unwrapEnvelope } from "@datafn/core";

// Validate and unwrap (throws if invalid)
const schema = unwrapEnvelope(
  validateSchema({
    resources: [
      {
        name: "user",
        version: 1,
        fields: [
          { name: "email", type: "string", required: true },
          { name: "name", type: "string", required: true },
        ],
      },
    ],
  }),
);
```

Validates a schema and returns an envelope. Use `unwrapEnvelope` to get the result or throw the error.

#### unwrapEnvelope<T>(env: DatafnEnvelope<T>): T

Helper to unwrap success result or throw error from an envelope.

#### normalizeDfql(dfql: unknown): unknown

```typescript
import { normalizeDfql } from "@datafn/core";

const normalized = normalizeDfql({ b: 2, a: 1, c: undefined });
// Returns: { a: 1, b: 2 }
```

Recursively sorts object keys and removes undefined values for deterministic comparison.

#### dfqlKey(dfql: unknown): string

```typescript
import { dfqlKey } from "@datafn/core";

const key = dfqlKey({ resource: "user", filters: { id: "user:1" } });
// Returns: deterministic JSON string for caching
```

Generates a deterministic cache key from DFQL.

#### ok<T>(result: T): DatafnEnvelope<T>
#### err(error: DatafnError): DatafnEnvelope<never>

Helpers to create success and error envelopes.

### Error Handling

DatafnError is a plain object interface, not a class.

#### DatafnError

```typescript
interface DatafnError {
  code: DatafnErrorCode;
  message: string;
  details?: {
    path: string;
    [key: string]: unknown;
  };
}
```

The `details.path` property is always present to indicate the location of the error (e.g., `"filters.status"` or `"$"`).

**Example:**

```typescript
const error: DatafnError = {
  code: "DFQL_INVALID",
  message: "Invalid query filter",
  details: {
    path: "filters.status",
    expected: ["active", "archived"]
  }
};
```

## Schema Definition Example

```typescript
import { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "post",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "content", type: "string", required: true },
        { name: "authorId", type: "string", required: true },
        { name: "publishedAt", type: "date", required: false },
      ],
      indices: {
        base: ["authorId"],
        search: ["title", "content"],
      },
    },
  ],
  relations: [
    {
      from: "post",
      to: "user",
      type: "many-one",
      relation: "author",
      fkField: "authorId",
    },
  ],
};
```

## License

MIT