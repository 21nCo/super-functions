/**
 * Contract tests for Drizzle adapter
 * Uses better-sqlite3 with Drizzle for in-memory testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import { drizzleAdapter } from './index.js';
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

describe('DrizzleAdapter - SQLite', () => {
  let adapter: Adapter;
  let sqlite: Database.Database;

  beforeEach(() => {
    // Create in-memory SQLite database
    sqlite = new Database(':memory:');
    const db = drizzle(sqlite);

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

    adapter = drizzleAdapter({
      db,
      dialect: 'sqlite',
      schema: { users, posts },
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
    it.skip('should execute transaction and commit (SQLite transactions not fully supported)', async () => {
      await adapter.transaction(async (trx) => {
        await trx.create({
          model: 'users',
          data: { id: '24', name: 'Uma', email: 'uma@example.com', age: 42 },
        });
        await trx.create({
          model: 'posts',
          data: { id: 'p1', title: 'Post 1', content: 'Content', authorId: '24' },
        });
      });

      const user = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '24' }],
      });
      const post = await adapter.findOne({
        model: 'posts',
        where: [{ field: 'id', operator: 'eq', value: 'p1' }],
      });

      expect(user).not.toBeNull();
      expect(post).not.toBeNull();
    });

    it.skip('should rollback transaction on error (SQLite transactions not fully supported)', async () => {
      await expect(
        adapter.transaction(async (trx) => {
          await trx.create({
            model: 'users',
            data: { id: '25', name: 'Victor', email: 'victor@example.com', age: 43 },
          });
          throw new Error('Rollback');
        })
      ).rejects.toThrow('Rollback');

      const user = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: '25' }],
      });

      expect(user).toBeNull();
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
});
