---
title: Custom database adapter
description: Implement the `@superfunctions/db` adapter contract for any storage backend.
---

# Custom database adapter

If your storage backend isn't on the bundled list (DynamoDB, MongoDB, FaunaDB, libSQL, Spanner, …), implement the adapter contract directly.

```ts
import type { Adapter } from '@superfunctions/db';

export function dynamoAdapter(client: DynamoDB): Adapter {
  return {
    async create(input) { /* PutItem */ },
    async findOne(input) { /* Query / GetItem */ },
    async findMany(input) { /* Query */ },
    async update(input) { /* UpdateItem */ },
    async delete(input) { /* DeleteItem */ },
    async count(input) { /* Query with COUNT */ },
    async transaction(fn) { /* TransactWriteItems */ },
    // ...
  };
}
```

The full type is exported from `@superfunctions/db`. Read the source at [`packages/db/src/adapter/types.ts`](https://github.com/21nCo/super-functions/blob/dev/packages/db/src/adapter/types.ts) — it's the canonical contract.

## Operations

| Method | Purpose |
| --- | --- |
| `create<T>(input)` | Insert a row. |
| `findOne<T>(input)` | Single row by where-clause. |
| `findMany<T>(input)` | Multiple rows. Supports `take`, `skip`, `orderBy`. |
| `update<T>(input)` | Update by where-clause. |
| `delete(input)` | Delete by where-clause. Returns `void`. |
| `count(input)` | Row count. |
| `transaction(fn)` | Run multiple ops atomically. |

## `where` shape

```ts
interface WhereClause {
  field: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with';
  value: unknown;
  connector?: 'AND' | 'OR';
}
```

The kernel currently uses `eq`, `gt`, `gte`, `lt`, `lte`, and `in`; adapters should implement the full public operator set so framework and plugin code can share one query contract.

## Field naming

The kernel calls `create` and `update` with `data` keyed by the field name in the `TableSchema` (typically `camelCase`). Your adapter is responsible for mapping to your storage's column / attribute names. The bundled `drizzleAdapter` does this via the schema's `fieldName` annotation; do the same.

## Transactional consistency

The kernel performs transactions for:

- Sign-up (create user → create credential).
- Account deletion (cascade).
- Region registration (lookup-store insert + region-profile insert).

Your `transaction` should be at-least-once-and-atomic. If your storage doesn't support transactions, document the failure modes clearly.

## Testing

A custom adapter should pass the **adapter conformance suite** (`@superfunctions/db/testing`). The suite is a vitest-compatible set of tests that validate every operation against your implementation:

```ts
// adapter.test.ts
import { afterEach, beforeEach, describe, it } from 'vitest';
import { describeAdapterContract } from '@superfunctions/db/testing';
import { myAdapter } from './my-adapter.js';
import { testSchema } from './test-schema.js';

const adapter = myAdapter(...);

describeAdapterContract(
  'myAdapter',
  {
    adapter,
    namespace: 'authfn_test',
    testSchema,
  },
  describe,
  it,
  beforeEach,
  afterEach,
);
```

## Submitting upstream

If your adapter is generally useful, consider sending it upstream. The bundled adapters live in `packages/db/src/adapters/<name>/` and follow a predictable structure: `index.ts` for the public factory, plus dialect-specific helpers.

## Related

- [`@superfunctions/db` source](https://github.com/21nCo/super-functions/tree/dev/packages/db) — the contract.
- [Existing adapters](https://github.com/21nCo/super-functions/tree/dev/packages/db/src/adapters) — reference implementations.
