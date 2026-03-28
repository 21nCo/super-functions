/**
 * Drizzle adapter (SQLite) — Row-level namespace isolation integration test.
 *
 * Covers:
 *  - TST-001: Namespace isolation contract tests run against Drizzle adapter
 *  - RLN-011: Drizzle adapter compatibility with rowLevelNamespace
 *  - TV-DRZ-001: Full CRUD cycle with Drizzle adapter (SQLite) and namespace filtering
 *
 * Phase 5 deliverable:
 *  - Runs the reusable contract test suite (from Phase 1) with Drizzle + SQLite backend.
 *  - Verifies at SQL level that __ns values are physically stored.
 *  - Verifies that idx_task___ns is used by the SQLite query planner.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import { drizzleAdapter } from '../index.js';
import { wrapWithRowLevelNamespace } from '../../../adapter/row-level-namespace.js';
import { runRowLevelNamespaceContractTests } from '../../../testing/namespace-contract-tests.js';
import type { Adapter } from '../../../adapter/types.js';

// ---------------------------------------------------------------------------
// Drizzle schemas:
//   taskStrict  — __ns NOT NULL  (used for SQL-level storage verification)
//   taskFlex    — __ns nullable   (used for contract tests, where disabled-mode
//                                  creates records without __ns)
// ---------------------------------------------------------------------------

const taskStrict = sqliteTable(
  'task',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    status: text('status'),
    __ns: text('__ns').notNull(),
  },
  (table) => [index('idx_task___ns').on(table.__ns)],
);

const taskFlex = sqliteTable(
  'task',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    status: text('status'),
    __ns: text('__ns'),  // nullable: contract tests test wrapper behaviour, not DB enforcement
  },
  (table) => [index('idx_task___ns').on(table.__ns)],
);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Factory for contract tests: uses nullable __ns so the disabled-mode test
 * (RLN-012) can insert records without __ns without hitting a NOT NULL error.
 * The application-level enforcement is verified by the wrapper, not the DB.
 */
function makeBaseAdapter(): { sqlite: Database.Database; adapter: Adapter } {
  const sqlite = new Database(':memory:');

  sqlite.exec(`
    CREATE TABLE task (
      id    TEXT PRIMARY KEY,
      title TEXT,
      status TEXT,
      __ns  TEXT
    );
    CREATE INDEX idx_task___ns ON task (__ns);
  `);

  const schema = { task: taskFlex };
  const db = drizzle(sqlite, { schema });

  const adapter = drizzleAdapter({
    db,
    dialect: 'sqlite',
    upsertKeys: { task: 'id' },
    debug: false,
  });

  return { sqlite, adapter };
}

/**
 * Factory for SQL-level verification: uses NOT NULL __ns column to prove that
 * the wrapper stamps every created row and the DB enforces the constraint.
 */
function makeStrictAdapter(): { sqlite: Database.Database; adapter: Adapter } {
  const sqlite = new Database(':memory:');

  // DDL matches what datafn codegen emits when multiTenant: true
  sqlite.exec(`
    CREATE TABLE task (
      id    TEXT PRIMARY KEY,
      title TEXT,
      status TEXT,
      __ns  TEXT NOT NULL
    );
    CREATE INDEX idx_task___ns ON task (__ns);
  `);

  const schema = { task: taskStrict };
  const db = drizzle(sqlite, { schema });

  const adapter = drizzleAdapter({
    db,
    dialect: 'sqlite',
    upsertKeys: { task: 'id' },
    debug: false,
  });

  return { sqlite, adapter };
}

// ---------------------------------------------------------------------------
// 5.3 — Full contract test suite against the wrapped Drizzle adapter
// (TST-001, RLN-011)
// ---------------------------------------------------------------------------

describe('Drizzle Adapter (SQLite) — Row-Level Namespace Contract Tests', () => {
  runRowLevelNamespaceContractTests(() => makeBaseAdapter().adapter);
});

// ---------------------------------------------------------------------------
// 5.2 — SQL-level verification: __ns values physically stored (TV-DRZ-001)
// ---------------------------------------------------------------------------

describe('Drizzle Adapter — SQL-level __ns storage verification (TV-DRZ-001)', () => {
  let sqlite: Database.Database;
  let baseAdapter: Adapter;
  let db: Adapter;

  beforeEach(() => {
    const { sqlite: sq, adapter } = makeStrictAdapter();
    sqlite = sq;
    baseAdapter = adapter;
    db = wrapWithRowLevelNamespace(baseAdapter, {
      enabled: true,
      columnName: '__ns',
      mandatory: true,
    });
  });

  it('step 1 — create in user:A stores __ns=user:A in SQLite', async () => {
    await db.create({
      model: 'task',
      data: { id: 't1', title: 'Alice task' },
      namespace: 'user:A',
    });

    const rows = sqlite
      .prepare('SELECT id, title, __ns FROM task WHERE id = ?')
      .all('t1') as any[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 't1', title: 'Alice task', __ns: 'user:A' });
  });

  it('step 2 — create in user:B stores __ns=user:B in SQLite', async () => {
    await db.create({
      model: 'task',
      data: { id: 't2', title: 'Bob task' },
      namespace: 'user:B',
    });

    const rows = sqlite
      .prepare('SELECT id, __ns FROM task WHERE id = ?')
      .all('t2') as any[];

    expect(rows[0]).toMatchObject({ id: 't2', __ns: 'user:B' });
  });

  it('step 3 — findMany user:A returns only user:A rows (full TV-DRZ-001 sequence)', async () => {
    // TV-DRZ-001 input sequence
    await db.create({ model: 'task', data: { id: 't1', title: 'A' }, namespace: 'user:A' });
    await db.create({ model: 'task', data: { id: 't2', title: 'B' }, namespace: 'user:B' });

    const results = await db.findMany({ model: 'task', where: [], namespace: 'user:A' });

    // TV-DRZ-001 expected output step 3
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 't1', title: 'A' });
    expect(results[0]).not.toHaveProperty('__ns');
  });

  it('cross-namespace isolation: user:B cannot see user:A records', async () => {
    await db.create({ model: 'task', data: { id: 't1', title: 'Alice' }, namespace: 'user:A' });

    const results = await db.findMany({ model: 'task', where: [], namespace: 'user:B' });

    expect(results).toHaveLength(0);
  });

  it('__ns is not exposed in the returned records', async () => {
    await db.create({ model: 'task', data: { id: 't1', title: 'Test' }, namespace: 'user:A' });

    const result = await db.findOne({
      model: 'task',
      where: [{ field: 'id', operator: 'eq', value: 't1' }],
      namespace: 'user:A',
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('__ns');
  });

  it('both namespaces physically coexist in the same SQLite table', async () => {
    await db.create({ model: 'task', data: { id: 'a1', title: 'Alice' }, namespace: 'user:A' });
    await db.create({ model: 'task', data: { id: 'b1', title: 'Bob' }, namespace: 'user:B' });

    // Raw SQLite — both rows present with correct __ns values
    const all = sqlite.prepare('SELECT id, __ns FROM task ORDER BY id').all() as any[];
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: 'a1', __ns: 'user:A' });
    expect(all[1]).toMatchObject({ id: 'b1', __ns: 'user:B' });
  });
});

// ---------------------------------------------------------------------------
// 5.2 — Index usage verification: EXPLAIN QUERY PLAN shows idx_task___ns
// ---------------------------------------------------------------------------

describe('Drizzle Adapter — __ns index usage (EXPLAIN QUERY PLAN)', () => {
  it('SQLite query planner uses idx_task___ns for __ns equality filter', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE task (
        id    TEXT PRIMARY KEY,
        title TEXT,
        __ns  TEXT NOT NULL
      );
      CREATE INDEX idx_task___ns ON task (__ns);
    `);

    // EXPLAIN QUERY PLAN returns rows with a "detail" column describing scan strategy
    const plan = sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM task WHERE __ns = 'user:A'")
      .all() as any[];

    // Concat all detail fields to check for index usage
    const detail = plan
      .map((r: any) => r.detail ?? r.Detail ?? '')
      .join(' ');

    // SQLite should use the index for this equality predicate
    expect(detail).toMatch(/idx_task___ns/i);
  });
});
