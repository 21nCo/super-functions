/**
 * Contract tests for Drizzle adapter
 * Uses better-sqlite3 with Drizzle for in-memory testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import { drizzleAdapter } from './index.js';
import { NotFoundError } from '../../adapter/errors.js';
import { wrapWithRowLevelNamespace } from '../../adapter/row-level-namespace.js';
import type { Adapter } from '../../adapter/types.js';

// Define test schema
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age'),
});

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: text('author_id').notNull(),
});

const namespacedUsers = sqliteTable('namespaced_users', {
  id: text('id').primaryKey(),
  __ns: text('__ns').notNull(),
  name: text('name').notNull(),
});

describe('DrizzleAdapter - SQLite', () => {
  let adapter: Adapter;
  let sqlite: Database.Database;

  beforeEach(() => {
    // Create in-memory SQLite database
    sqlite = new Database(':memory:');

    // Create tables
    sqlite.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        age INTEGER
      );
      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        author_id TEXT NOT NULL
      );
      CREATE TABLE namespaced_users (
        id TEXT PRIMARY KEY,
        __ns TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE __superfunctions_schema_versions (
        namespace TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        appliedAt TEXT NOT NULL
      );
    `);

    const schemaVersionsTable = sqliteTable('__superfunctions_schema_versions', {
      namespace: text('namespace').primaryKey(),
      version: integer('version').notNull(),
      appliedAt: text('appliedAt').notNull(),
    });

    // Pass schema to drizzle() constructor so it's available in db._.fullSchema
    const schema = { users, posts, namespacedUsers, __superfunctions_schema_versions: schemaVersionsTable };
    const db = drizzle(sqlite, { schema });

    adapter = drizzleAdapter({
      db,
      dialect: 'sqlite',
      upsertKeys: { users: 'id', posts: 'id' },
      schemaVersionsTable,
      debug: false,
    });
  });

  describe('CRUD Operations', () => {
    it('should create a record', async () => {
      const user = await adapter.create({
        model: 'users',
        data: { id: '1', name: 'Alice', email: 'alice@example.com', age: 30 },
      });

      expect(user).toMatchObject({
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });
    });

    it('should create with select', async () => {
      const user = await adapter.create({
        model: 'users',
        data: { id: '2', name: 'Bob', email: 'bob@example.com', age: 25 },
        select: ['id', 'name'],
      });

      expect(user).toHaveProperty('id', '2');
      expect(user).toHaveProperty('name', 'Bob');
      expect(user).not.toHaveProperty('age');
    });

    it('should findOne by where', async () => {
      await adapter.create({
        model: 'users',
        data: { id: '3', name: 'Charlie', email: 'charlie@example.com', age: 35 },
      });

      const found = await adapter.findOne({
        model: 'users',
        where: [{ field: 'email', operator: 'eq', value: 'charlie@example.com' }],
      });

      expect(found).toMatchObject({ name: 'Charlie', age: 35 });
    });

    it('should findOne with select', async () => {
      await adapter.create({
        model: 'users',
        data: { id: '4', name: 'Dave', email: 'dave@example.com', age: 40 },
      });

      const found = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '4' }],
        select: ['name', 'email'],
      });

      expect(found).toMatchObject({ name: 'Dave', email: 'dave@example.com' });
      expect(found).not.toHaveProperty('age');
    });

    it('should return null when findOne finds nothing', async () => {
      const found = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'nonexistent' }],
      });

      expect(found).toBeNull();
    });

    it('treats eq/null and ne/null as IS NULL and IS NOT NULL', async () => {
      await adapter.createMany({
        model: 'posts',
        data: [
          { id: 'null-post', title: 'Null body', content: null, authorId: 'a1' },
          { id: 'text-post', title: 'Text body', content: 'hello', authorId: 'a1' }
        ],
      });

      const nullContent = await adapter.findMany({
        model: 'posts',
        where: [{ field: 'content', operator: 'eq', value: null }],
      });
      const nonNullContent = await adapter.findMany({
        model: 'posts',
        where: [{ field: 'content', operator: 'ne', value: null }],
      });

      expect(nullContent.map((row) => row.id)).toEqual(['null-post']);
      expect(nonNullContent.map((row) => row.id)).toEqual(['text-post']);
    });

    it('should findMany with filters', async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: '5', name: 'Eve', email: 'eve@example.com', age: 28 },
          { id: '6', name: 'Frank', email: 'frank@example.com', age: 32 },
          { id: '7', name: 'Grace', email: 'grace@example.com', age: 27 },
        ],
      });

      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'age', operator: 'gte', value: 28 }],
        orderBy: [{ field: 'age', direction: 'asc' }],
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Eve');
      expect(results[1].name).toBe('Frank');
    });

    it('should findMany with limit and offset', async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: '8', name: 'User8', email: 'u8@example.com', age: 20 },
          { id: '9', name: 'User9', email: 'u9@example.com', age: 21 },
          { id: '10', name: 'User10', email: 'u10@example.com', age: 22 },
        ],
      });

      const results = await adapter.findMany({
        model: 'users',
        where: [],
        orderBy: [{ field: 'age', direction: 'asc' }],
        limit: 2,
        offset: 1,
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('User9');
    });

    it('should update a record', async () => {
      await adapter.create({
        model: 'users',
        data: { id: '11', name: 'Henry', email: 'henry@example.com', age: 45 },
      });

      const updated = await adapter.update({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '11' }],
        data: { age: 46 },
      });

      expect(updated).toMatchObject({ id: '11', age: 46 });
    });

    it('should throw NotFoundError when update matches zero rows', async () => {
      await expect(
        adapter.update({
          model: 'users',
          where: [{ field: 'id', operator: 'eq', value: 'missing-user' }],
          data: { age: 46 },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should preserve NotFoundError through row-level namespace wrapper', async () => {
      const namespaced = wrapWithRowLevelNamespace(adapter, { enabled: true });
      await expect(
        namespaced.update({
          model: 'namespacedUsers',
          where: [{ field: 'id', operator: 'eq', value: 'missing-user' }],
          data: { name: 'updated-name' },
          namespace: 'user:a',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should delete a record', async () => {
      await adapter.create({
        model: 'users',
        data: { id: '12', name: 'Ivy', email: 'ivy@example.com', age: 29 },
      });

      await adapter.delete({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '12' }],
      });

      const found = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '12' }],
      });

      expect(found).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should createMany', async () => {
      const users = await adapter.createMany({
        model: 'users',
        data: [
          { id: '13', name: 'Jack', email: 'jack@example.com', age: 33 },
          { id: '14', name: 'Kate', email: 'kate@example.com', age: 34 },
        ],
      });

      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Jack');
      expect(users[1].name).toBe('Kate');
    });

    it('should updateMany', async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: '15', name: 'Leo', email: 'leo@example.com', age: 25 },
          { id: '16', name: 'Mia', email: 'mia@example.com', age: 25 },
        ],
      });

      const count = await adapter.updateMany({
        model: 'users',
        where: [{ field: 'age', operator: 'eq', value: 25 }],
        data: { age: 26 },
      });

      expect(count).toBe(2);
    });

    it('should deleteMany', async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: '17', name: 'Nina', email: 'nina@example.com', age: 50 },
          { id: '18', name: 'Oscar', email: 'oscar@example.com', age: 51 },
        ],
      });

      const count = await adapter.deleteMany({
        model: 'users',
        where: [{ field: 'age', operator: 'gte', value: 50 }],
      });

      expect(count).toBe(2);
    });
  });

  describe('Advanced Operations', () => {
    it('should upsert - insert on conflict', async () => {
      const user = await adapter.upsert({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '19' }],
        create: { id: '19', name: 'Paul', email: 'paul@example.com', age: 36 },
        update: { age: 37 },
      });

      expect(user).toMatchObject({ id: '19', name: 'Paul', age: 36 });
    });

    it('should upsert with empty update (insert-if-not-exists)', async () => {
      // This tests the fix for "No values to set" error when update is empty
      // (e.g. many-many relate with no metadata)
      const user = await adapter.upsert({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'empty-upd-1' }],
        create: { id: 'empty-upd-1', name: 'NoMeta', email: 'nometa@example.com', age: 22 },
        update: {},
      });

      expect(user).toMatchObject({ id: 'empty-upd-1', name: 'NoMeta', age: 22 });

      // Second call should be idempotent (no-op, row already exists)
      const user2 = await adapter.upsert({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'empty-upd-1' }],
        create: { id: 'empty-upd-1', name: 'Overwrite', email: 'overwrite@example.com', age: 99 },
        update: {},
      });

      // Should return existing row, not the new create data
      expect(user2).toMatchObject({ id: 'empty-upd-1', name: 'NoMeta', age: 22 });
    });

    it('should upsert - update on conflict', async () => {
      await adapter.create({
        model: 'users',
        data: { id: '20', name: 'Quinn', email: 'quinn@example.com', age: 38 },
      });

      const user = await adapter.upsert({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '20' }],
        create: { id: '20', name: 'Quinn2', email: 'quinn2@example.com', age: 39 },
        update: { age: 40 },
      });

      expect(user).toMatchObject({ id: '20', age: 40 });
    });

    it('should count records', async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: '21', name: 'Rachel', email: 'rachel@example.com', age: 30 },
          { id: '22', name: 'Sam', email: 'sam@example.com', age: 31 },
          { id: '23', name: 'Tina', email: 'tina@example.com', age: 30 },
        ],
      });

      const total = await adapter.count({ model: 'users', where: [] });
      expect(total).toBeGreaterThanOrEqual(3);

      const filtered = await adapter.count({
        model: 'users',
        where: [{ field: 'age', operator: 'eq', value: 30 }],
      });
      expect(filtered).toBe(2);
    });
  });

  describe('Transactions', () => {
    it('does not advertise or enter unsafe async SQLite transactions', async () => {
      const callback = vi.fn();

      expect(adapter.capabilities.transactions.supported).toBe(false);
      await expect(adapter.transaction(callback)).rejects.toThrow('SQLite async transactions');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Schema Management', () => {
    it('should get and set schema version', async () => {
      const initialVersion = await adapter.getSchemaVersion('test-lib');
      expect(initialVersion).toBe(0);

      await adapter.setSchemaVersion('test-lib', 5);
      const newVersion = await adapter.getSchemaVersion('test-lib');
      expect(newVersion).toBe(5);
    });

    it('should update schema version', async () => {
      await adapter.setSchemaVersion('another-lib', 1);
      await adapter.setSchemaVersion('another-lib', 2);
      const version = await adapter.getSchemaVersion('another-lib');
      expect(version).toBe(2);
    });
  });

  describe('Lifecycle', () => {
    it('should return healthy status', async () => {
      const health = await adapter.isHealthy();
      expect(health.healthy).toBe(true);
    });

    it('should initialize without error', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should close without error', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });

  describe('Where Operators', () => {
    beforeEach(async () => {
      await adapter.createMany({
        model: 'users',
        data: [
          { id: 'w1', name: 'Alice', email: 'alice@test.com', age: 25 },
          { id: 'w2', name: 'Bob', email: 'bob@test.com', age: 30 },
          { id: 'w3', name: 'Charlie', email: 'charlie@test.com', age: 35 },
          { id: 'w4', name: 'Alicia', email: 'alicia@test.com', age: 28 },
        ],
      });
    });

    it('should filter with ne (not equal)', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'age', operator: 'ne', value: 30 }],
      });
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter with gt (greater than)', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'age', operator: 'gt', value: 28 }],
      });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter with in', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'age', operator: 'in', value: [25, 35] }],
      });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter with contains', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'name', operator: 'contains', value: 'lic' }],
      });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should advertise native text search support', () => {
      expect(adapter.capabilities.operations.fulltext).toBe(true);
    });

    it('should filter with starts_with', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'name', operator: 'starts_with', value: 'Ali' }],
      });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter with ends_with', async () => {
      const results = await adapter.findMany({
        model: 'users',
        where: [{ field: 'email', operator: 'ends_with', value: 'test.com' }],
      });
      expect(results.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Internal CRUD (TV-DRZ-INTERNAL-001)', () => {
    it('should roundtrip create/findOne/update/delete on internal table', async () => {
      await adapter.internal.ensureTable('__datafn_meta', [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'namespace', type: 'text' },
        { name: 'nextServerSeq', type: 'integer' },
      ]);

      // Create
      await adapter.internal.create('__datafn_meta', {
        id: 'datafn:nextServerSeq',
        namespace: 'datafn',
        nextServerSeq: 1,
      });

      // FindOne
      const row = await adapter.internal.findOne('__datafn_meta', [
        { field: 'id', op: 'eq', value: 'datafn:nextServerSeq' },
      ]);
      expect(row).toMatchObject({ id: 'datafn:nextServerSeq', namespace: 'datafn', nextServerSeq: 1 });

      // Update
      const updated = await adapter.internal.update(
        '__datafn_meta',
        [{ field: 'id', op: 'eq', value: 'datafn:nextServerSeq' }],
        { nextServerSeq: 2 },
      );
      expect(updated).toBe(1);

      // FindOne after update
      const afterUpdate = await adapter.internal.findOne('__datafn_meta', [
        { field: 'id', op: 'eq', value: 'datafn:nextServerSeq' },
      ]);
      expect(afterUpdate).toMatchObject({ nextServerSeq: 2 });

      // Delete
      const deleted = await adapter.internal.delete('__datafn_meta', [
        { field: 'id', op: 'eq', value: 'datafn:nextServerSeq' },
      ]);
      expect(deleted).toBe(1);

      // Verify deleted
      const gone = await adapter.internal.findOne('__datafn_meta', [
        { field: 'id', op: 'eq', value: 'datafn:nextServerSeq' },
      ]);
      expect(gone).toBeNull();
    });

    it('should cache ensureTable calls (DDL runs only once)', async () => {
      await adapter.internal.ensureTable('__datafn_meta', [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'namespace', type: 'text' },
        { name: 'nextServerSeq', type: 'integer' },
      ]);
      // Second call should not throw
      await adapter.internal.ensureTable('__datafn_meta', [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'namespace', type: 'text' },
        { name: 'nextServerSeq', type: 'integer' },
      ]);
    });

    it('should reject invalid table names (TV-ENSURE-002)', async () => {
      await expect(
        adapter.internal.ensureTable('users', [{ name: 'id', type: 'text', primaryKey: true }]),
      ).rejects.toThrow('ensureTable: table name must start with "__datafn_": "users"');
    });
  });

  describe('Internal CRUD FindMany (TV-DRZ-INTERNAL-002)', () => {
    it('should return filtered, ordered results with limit', async () => {
      await adapter.internal.ensureTable('__datafn_changes', [
        { name: 'id', type: 'text', primaryKey: true },
        { name: 'namespace', type: 'text' },
        { name: 'serverSeq', type: 'integer' },
        { name: 'resource', type: 'text' },
      ]);

      await adapter.internal.create('__datafn_changes', {
        id: 'c1', namespace: 'datafn', serverSeq: 3, resource: 'todos',
      });
      await adapter.internal.create('__datafn_changes', {
        id: 'c2', namespace: 'datafn', serverSeq: 1, resource: 'todos',
      });
      await adapter.internal.create('__datafn_changes', {
        id: 'c3', namespace: 'datafn', serverSeq: 2, resource: 'todos',
      });

      const rows = await adapter.internal.findMany(
        '__datafn_changes',
        [{ field: 'namespace', op: 'eq', value: 'datafn' }],
        { orderBy: 'serverSeq', limit: 2 },
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: 'c2', serverSeq: 1 });
      expect(rows[1]).toMatchObject({ id: 'c3', serverSeq: 2 });
    });
  });
});

describe('DrizzleAdapter - Postgres/MySQL Dialect Support', () => {
  /**
   * This test verifies that the dialect-aware execution paths work correctly.
   * We verify that db.execute() is called instead of db.run()/db.all() for Postgres/MySQL.
   */
  it('should use db.execute() for Postgres dialect instead of db.run()/db.all()', async () => {
    const executeCalls: any[] = [];

    // Mock Postgres Drizzle instance (no run/all methods, only execute)
    const mockDb = {
      async execute(query: any): Promise<any> {
        executeCalls.push({ type: 'execute', query });
        // Return empty result for DDL, rows array for SELECT, rowCount for DML
        const queryStr = query.queryChunks 
          ? query.queryChunks.map((chunk: any) => (typeof chunk === 'string' ? chunk : '?')).join('')
          : '';
        if (queryStr.includes('CREATE TABLE')) return { rowCount: 0 };
        if (queryStr.includes('SELECT')) return [];
        return { rowCount: 0 };
      },
    };

    const adapter = drizzleAdapter({
      db: mockDb,
      dialect: 'postgres',
      debug: false,
    });

    // Verify ensureTable uses db.execute()
    await adapter.internal.ensureTable('__datafn_test', [
      { name: 'id', type: 'text', primaryKey: true },
    ]);

    expect(executeCalls.length).toBeGreaterThan(0);
    expect(executeCalls[0].type).toBe('execute');

    // Verify create uses db.execute()
    executeCalls.length = 0;
    await adapter.internal.create('__datafn_test', { id: 'test' });
    expect(executeCalls.length).toBeGreaterThan(0);
    expect(executeCalls[0].type).toBe('execute');

    // Verify findOne uses db.execute()
    executeCalls.length = 0;
    await adapter.internal.findOne('__datafn_test', [{ field: 'id', op: 'eq', value: 'test' }]);
    expect(executeCalls.length).toBeGreaterThan(0);
    expect(executeCalls[0].type).toBe('execute');
  });

  it('should use db.execute() for MySQL dialect', async () => {
    const executeCalls: any[] = [];

    // Mock MySQL Drizzle instance (no run/all methods, only execute)
    const mockDb = {
      async execute(query: any): Promise<any> {
        executeCalls.push({ type: 'execute', query });
        const queryStr = query.queryChunks 
          ? query.queryChunks.map((chunk: any) => (typeof chunk === 'string' ? chunk : '?')).join('')
          : '';
        if (queryStr.includes('CREATE TABLE')) return { rowsAffected: 0 };
        if (queryStr.includes('SELECT')) return { rows: [] };
        return { rowsAffected: 0 };
      },
    };

    const adapter = drizzleAdapter({
      db: mockDb,
      dialect: 'mysql',
      debug: false,
    });

    // Verify ensureTable uses db.execute()
    await adapter.internal.ensureTable('__datafn_test', [
      { name: 'id', type: 'text', primaryKey: true },
    ]);

    expect(executeCalls.length).toBeGreaterThan(0);
    expect(executeCalls[0].type).toBe('execute');
  });
});
