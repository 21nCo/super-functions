# @superfunctions/db

Shared database adapter system for Superfunctions libraries. Provides a unified interface for interacting with databases across multiple ORMs (Drizzle, Prisma, Kysely).

## Installation

```bash
npm install @superfunctions/db

# Install the integration you use. drizzle-orm is a required peer;
# @prisma/client and kysely are optional peers.
npm install drizzle-orm
npm install @prisma/client
npm install kysely

# The PostgreSQL Drizzle examples also import the pg driver directly.
npm install pg
```

## Quick Start

Memory adapter (tests and local):

```typescript
import { memoryAdapter } from '@superfunctions/db/adapters';

const adapter = memoryAdapter();

const user = await adapter.create({
  model: 'users',
  data: { email: 'user@example.com', name: 'John Doe' },
});
```

Drizzle adapter (Postgres, MySQL, SQLite):

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzleAdapter } from '@superfunctions/db/adapters';
import { Pool } from 'pg';
import { users } from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { users } });
const adapter = drizzleAdapter({
  db,
  dialect: 'postgres', // 'postgres' | 'mysql' | 'sqlite'
  upsertKeys: { users: 'email' },
});
```

Runnable demos: [`examples/`](./examples/).

## Core Concepts

### Adapter Interface

All adapters implement a unified interface:

```typescript
interface Adapter {
  // CRUD operations
  create(params: CreateParams): Promise<T>;
  findOne(params: FindOneParams): Promise<T | null>;
  findMany(params: FindManyParams): Promise<T[]>;
  update(params: UpdateParams): Promise<T>;
  delete(params: DeleteParams): Promise<void>;
  
  // Batch operations
  createMany(params: CreateManyParams): Promise<T[]>;
  updateMany(params: UpdateManyParams): Promise<number>;
  deleteMany(params: DeleteManyParams): Promise<number>;
  
  // Advanced
  upsert(params: UpsertParams): Promise<T>;
  count(params: CountParams): Promise<number>;
  transaction<R>(callback: (trx: TransactionAdapter) => Promise<R>): Promise<R>;
  
  // Lifecycle
  initialize(): Promise<void>;
  isHealthy(): Promise<HealthStatus>;
  close(): Promise<void>;
  
  // Schema management
  getSchemaVersion(namespace: string): Promise<number>;
  setSchemaVersion(namespace: string, version: number): Promise<void>;
}
```

### Capabilities System

Adapters declare their capabilities, and libraries adapt accordingly:

```typescript
const adapter = memoryAdapter();

if (adapter.capabilities.operations.batch) {
  // Use batch operations
  await adapter.createMany({ model: 'users', data: users });
} else {
  // Fallback to sequential
  for (const user of users) {
    await adapter.create({ model: 'users', data: user });
  }
}
```

### Namespace Isolation

Scope records by the `namespace` supplied on each operation:

```typescript
import { wrapWithRowLevelNamespace } from '@superfunctions/db';
import { memoryAdapter } from '@superfunctions/db/adapters';

const adapter = wrapWithRowLevelNamespace(memoryAdapter(), {
  enabled: true,
  columnName: '__ns',
  mandatory: true,
});

await adapter.create({
  model: 'users',
  data: { email: 'user@example.com' },
  namespace: 'auth',
});
// Stored with __ns = 'auth'; other namespaces cannot read this row.

await adapter.create({
  model: 'files',
  data: { path: '/readme.md' },
  namespace: 'files',
});
// Stored with __ns = 'files'.
```

## Built-in Adapters

### Memory Adapter

In-memory adapter for testing and development:

```typescript
import { memoryAdapter } from '@superfunctions/db/adapters';

const adapter = memoryAdapter({
  namespace: { enabled: true },
  debug: true
});
```

### Drizzle Adapter

For Drizzle ORM (PostgreSQL, MySQL, SQLite):

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { users, posts } from './schema';
import { drizzleAdapter } from '@superfunctions/db/adapters';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { users, posts } });
const adapter = drizzleAdapter({
  db,
  dialect: 'postgres', // 'postgres' | 'mysql' | 'sqlite'
  upsertKeys: { users: 'email' }, // conflict targets
  debug: false
});
```

**Features:**
- Full CRUD with where/orderBy/select
- Batch operations
- Transactions (async for Postgres/MySQL)
- Upsert with conflict resolution
- All where operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, starts_with, ends_with

### Prisma Adapter

For Prisma ORM:

```typescript
import { PrismaClient } from '@prisma/client';
import { prismaAdapter } from '@superfunctions/db/adapters';

const prisma = new PrismaClient();
const adapter = prismaAdapter({
  prisma,
  modelMap: { users: 'user', posts: 'post' }, // model → Prisma model name
  schemaVersionsTable: 'schemaVersions', // optional
  debug: false
});
```

**Features:**
- Full where clause translation with AND/OR
- Select projection and orderBy
- Batch operations
- Transaction support via `$transaction`
- Upsert with unique constraints

### Kysely Adapter

For Kysely query builder:

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import { kyselyAdapter } from '@superfunctions/db/adapters';

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool })
});

const adapter = kyselyAdapter({
  db,
  dialect: 'postgres', // 'postgres' | 'mysql' | 'sqlite'
  schema: { users: 'users', posts: 'posts' }, // model → table name
  schemaVersionsTable: '__schema_versions', // optional
  debug: false
});
```

**Features:**
- Type-safe query building
- Full CRUD with all operators
- Transactions
- Upsert (INSERT...ON CONFLICT)
- Multi-dialect support


## Testing

Use the built-in memory adapter for testing:

```typescript
import { memoryAdapter } from '@superfunctions/db/testing';
import { describe, it, expect } from 'vitest';

describe('My Library', () => {
  it('should create records', async () => {
    const adapter = memoryAdapter();
    
    const result = await adapter.create({
      model: 'users',
      data: { name: 'John' }
    });
    
    expect(result).toHaveProperty('id');
    expect(result.name).toBe('John');
  });
});
```

## TypeScript

Full TypeScript support with strict types:

```typescript
import type {
  Adapter,
  CreateParams,
  WhereClause,
  TableSchema
} from '@superfunctions/db';

const adapter: Adapter = memoryAdapter();

const params: CreateParams = {
  model: 'users',
  data: { name: 'John' }
};

const user = await adapter.create(params);
```

## Error Handling

Standardized error classes across all adapters:

```typescript
import { 
  AdapterError, 
  NotFoundError, 
  ConnectionError 
} from '@superfunctions/db';

try {
  await adapter.findOne({ model: 'users', where: [{ field: 'id', operator: 'eq', value: '123' }] });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('User not found');
  } else if (error instanceof ConnectionError) {
    console.log('Database connection failed');
  } else if (error instanceof AdapterError) {
    console.log('Adapter error:', error.code);
  }
}
```

## License

Apache-2.0

## Contributing

Contributions welcome! See [Contributing Guide](../../CONTRIBUTING.md) for details.

## Related Packages

- `@superfunctions/cli` - Schema management and migrations
