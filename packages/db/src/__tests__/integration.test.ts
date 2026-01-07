/**
 * Integration tests for adapter system
 * Tests the factory pattern, transformations, and adapter lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { memoryAdapter } from '../adapters/memory/index.js';
import { createSchemaTracker } from '../migrations/schema-tracker.js';
import { validateRecordAgainstSchema } from '../migrations/runtime-validation.js';
import type { Adapter, TableSchema } from '../adapter/types.js';

describe('Integration Tests', () => {
  let adapter: Adapter;

  beforeEach(() => {
    adapter = memoryAdapter({ debug: false });
  });

  describe('Adapter Lifecycle', () => {
    it('should initialize and check health', async () => {
      await adapter.initialize();
      const health = await adapter.isHealthy();
      expect(health.healthy).toBe(true);
    });

    it('should have correct metadata', () => {
      expect(adapter.id).toBe('memory');
      expect(adapter.name).toBe('Memory Adapter');
      expect(adapter.version).toBe('1.0.0');
      expect(adapter.capabilities).toBeDefined();
    });

    it('should close without error', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });

  describe('CRUD Workflow', () => {
    it('should complete full CRUD cycle', async () => {
      // Create
      const created = await adapter.create({
        model: 'users',
        data: { id: 'u1', name: 'Alice', email: 'alice@test.com', age: 30 },
      });
      expect(created).toMatchObject({ id: 'u1', name: 'Alice' });

      // Read one
      const found = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u1' }],
      });
      expect(found).toMatchObject({ name: 'Alice', age: 30 });

      // Update
      const updated = await adapter.update({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u1' }],
        data: { age: 31 },
      });
      expect(updated).toMatchObject({ id: 'u1', age: 31 });

      // Read many
      const all = await adapter.findMany({
        model: 'users',
        where: [],
      });
      expect(all).toHaveLength(1);

      // Delete
      await adapter.delete({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u1' }],
      });

      const afterDelete = await adapter.findOne({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u1' }],
      });
      expect(afterDelete).toBeNull();
    });

    it('should handle batch operations', async () => {
      // Create many
      const created = await adapter.createMany({
        model: 'products',
        data: [
          { id: 'p1', name: 'Product 1', price: 100 },
          { id: 'p2', name: 'Product 2', price: 200 },
          { id: 'p3', name: 'Product 3', price: 300 },
        ],
      });
      expect(created).toHaveLength(3);

      // Update many
      const updated = await adapter.updateMany({
        model: 'products',
        where: [{ field: 'price', operator: 'gte', value: 200 }],
        data: { price: 250 },
      });
      expect(updated).toBe(2);

      // Count
      const count = await adapter.count({
        model: 'products',
        where: [{ field: 'price', operator: 'eq', value: 250 }],
      });
      expect(count).toBe(2);

      // Delete many
      const deleted = await adapter.deleteMany({
        model: 'products',
        where: [{ field: 'price', operator: 'eq', value: 250 }],
      });
      expect(deleted).toBe(2);
    });

    it('should handle upsert', async () => {
      // First upsert (insert)
      const inserted = await adapter.upsert({
        model: 'settings',
        where: [{ field: 'key', operator: 'eq', value: 'theme' }],
        create: { key: 'theme', value: 'dark' },
        update: { value: 'light' },
      });
      expect(inserted).toMatchObject({ key: 'theme', value: 'dark' });

      // Second upsert (update)
      const updated = await adapter.upsert({
        model: 'settings',
        where: [{ field: 'key', operator: 'eq', value: 'theme' }],
        create: { key: 'theme', value: 'dark' },
        update: { value: 'light' },
      });
      expect(updated).toMatchObject({ key: 'theme', value: 'light' });
    });
  });

  describe('Query Features', () => {
    beforeEach(async () => {
      await adapter.createMany({
        model: 'books',
        data: [
          { id: 'b1', title: 'TypeScript Handbook', author: 'Team', year: 2023, pages: 300 },
          { id: 'b2', title: 'JavaScript Guide', author: 'Author A', year: 2022, pages: 250 },
          { id: 'b3', title: 'TypeScript Advanced', author: 'Author B', year: 2023, pages: 400 },
          { id: 'b4', title: 'Node.js Essentials', author: 'Author A', year: 2021, pages: 200 },
        ],
      });
    });

    it('should filter with where clauses', async () => {
      const results = await adapter.findMany({
        model: 'books',
        where: [
          { field: 'year', operator: 'eq', value: 2023 },
          { field: 'pages', operator: 'gte', value: 300, connector: 'AND' },
        ],
      });
      expect(results).toHaveLength(2);
    });

    it('should support orderBy', async () => {
      const results = await adapter.findMany({
        model: 'books',
        where: [],
        orderBy: [{ field: 'pages', direction: 'desc' }],
      });
      expect(results[0].title).toBe('TypeScript Advanced');
      expect(results[results.length - 1].title).toBe('Node.js Essentials');
    });

    it('should support pagination', async () => {
      const page1 = await adapter.findMany({
        model: 'books',
        where: [],
        orderBy: [{ field: 'year', direction: 'asc' }],
        limit: 2,
        offset: 0,
      });
      expect(page1).toHaveLength(2);

      const page2 = await adapter.findMany({
        model: 'books',
        where: [],
        orderBy: [{ field: 'year', direction: 'asc' }],
        limit: 2,
        offset: 2,
      });
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should support select projection', async () => {
      const results = await adapter.findMany({
        model: 'books',
        where: [{ field: 'id', operator: 'eq', value: 'b1' }],
        select: ['title', 'author'],
      });
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('author');
      expect(results[0]).not.toHaveProperty('year');
    });

    it('should support string operators', async () => {
      const contains = await adapter.findMany({
        model: 'books',
        where: [{ field: 'title', operator: 'contains', value: 'Type' }],
      });
      expect(contains).toHaveLength(2);

      const startsWith = await adapter.findMany({
        model: 'books',
        where: [{ field: 'title', operator: 'starts_with', value: 'Type' }],
      });
      expect(startsWith).toHaveLength(2);

      const endsWith = await adapter.findMany({
        model: 'books',
        where: [{ field: 'title', operator: 'ends_with', value: 'Guide' }],
      });
      expect(endsWith).toHaveLength(1);
    });

    it('should support in/not_in operators', async () => {
      const inResults = await adapter.findMany({
        model: 'books',
        where: [{ field: 'year', operator: 'in', value: [2022, 2023] }],
      });
      expect(inResults).toHaveLength(3);

      const notInResults = await adapter.findMany({
        model: 'books',
        where: [{ field: 'year', operator: 'not_in', value: [2022, 2023] }],
      });
      expect(notInResults).toHaveLength(1);
    });
  });

  describe('Schema Tracker Integration', () => {
    it('should track schema versions', async () => {
      const tracker = createSchemaTracker(adapter);

      const initialVersion = await tracker.getVersion('test-lib');
      expect(initialVersion).toBe(0);

      await tracker.setVersion('test-lib', 1);
      const newVersion = await tracker.getVersion('test-lib');
      expect(newVersion).toBe(1);

      await tracker.setVersion('test-lib', 2);
      const updatedVersion = await tracker.getVersion('test-lib');
      expect(updatedVersion).toBe(2);
    });

    it('should check version status', async () => {
      const tracker = createSchemaTracker(adapter);

      await tracker.setVersion('lib-a', 5);

      const status = await tracker.getVersionStatus('lib-a', 5);
      expect(status.status).toBe('up-to-date');

      const outdated = await tracker.getVersionStatus('lib-a', 10);
      expect(outdated.status).toBe('outdated');

      const notInstalled = await tracker.getVersionStatus('lib-b', 1);
      expect(notInstalled.status).toBe('not-installed');
    });

    it('should list all versions', async () => {
      const tracker = createSchemaTracker(adapter);

      await tracker.setVersion('lib-1', 1);
      await tracker.setVersion('lib-2', 2);
      await tracker.setVersion('lib-3', 3);

      const all = await tracker.getAllVersions();
      expect(all).toHaveLength(3);
      expect(all.map((v) => v.namespace)).toContain('lib-1');
    });
  });

  describe('Runtime Validation Integration', () => {
    it('should validate records against schema', () => {
      const schema: TableSchema = {
        modelName: 'users',
        fields: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          age: { type: 'number', required: false },
          email: { type: 'string', required: true },
        },
      };

      const validRecord = { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' };
      const result = validateRecordAgainstSchema(schema, validRecord);
      expect(result.valid).toBe(true);
    });

    it('should detect validation errors', () => {
      const schema: TableSchema = {
        modelName: 'users',
        fields: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          age: { type: 'number', required: false },
        },
      };

      const invalidRecord = { id: '1', name: 'Alice', age: 'thirty' }; // age should be number
      const result = validateRecordAgainstSchema(schema, invalidRecord);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('must be a number');
    });

    it('should detect missing required fields', () => {
      const schema: TableSchema = {
        modelName: 'users',
        fields: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
        },
      };

      const incompleteRecord = { id: '1' }; // missing name
      const result = validateRecordAgainstSchema(schema, incompleteRecord);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('required');
    });
  });

  describe('Error Handling', () => {
    it('should handle not found scenarios gracefully', async () => {
      const result = await adapter.findOne({
        model: 'nonexistent',
        where: [{ field: 'id', operator: 'eq', value: 'missing' }],
      });
      expect(result).toBeNull();
    });

    it('should handle empty result sets', async () => {
      const results = await adapter.findMany({
        model: 'empty-table',
        where: [],
      });
      expect(results).toEqual([]);
    });

    it('should count zero for empty tables', async () => {
      const count = await adapter.count({
        model: 'empty-table',
        where: [],
      });
      expect(count).toBe(0);
    });
  });

  describe('Adapter Capabilities', () => {
    it('should expose capabilities', () => {
      const caps = adapter.capabilities;
      
      expect(caps.types).toBeDefined();
      expect(caps.operations).toBeDefined();
      expect(caps.transactions).toBeDefined();
      expect(caps.performance).toBeDefined();
      expect(caps.schema).toBeDefined();
      expect(caps.advanced).toBeDefined();
    });

    it('should have correct type support', () => {
      const caps = adapter.capabilities;
      expect(caps.types.json).toBe(true);
      expect(caps.types.dates).toBe(true);
      expect(caps.types.booleans).toBe(true);
    });

    it('should declare operation support', () => {
      const caps = adapter.capabilities;
      expect(caps.operations.batch).toBeDefined();
      expect(caps.operations.upsert).toBeDefined();
      expect(caps.operations.returning).toBeDefined();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multi-step workflow', async () => {
      // Create users
      await adapter.createMany({
        model: 'users',
        data: [
          { id: 'u1', name: 'Alice', role: 'admin', active: true },
          { id: 'u2', name: 'Bob', role: 'user', active: true },
          { id: 'u3', name: 'Charlie', role: 'user', active: false },
        ],
      });

      // Create posts
      await adapter.createMany({
        model: 'posts',
        data: [
          { id: 'p1', title: 'Post 1', authorId: 'u1', published: true },
          { id: 'p2', title: 'Post 2', authorId: 'u1', published: false },
          { id: 'p3', title: 'Post 3', authorId: 'u2', published: true },
        ],
      });

      // Query active users
      const activeUsers = await adapter.findMany({
        model: 'users',
        where: [{ field: 'active', operator: 'eq', value: true }],
      });
      expect(activeUsers).toHaveLength(2);

      // Query published posts
      const publishedPosts = await adapter.findMany({
        model: 'posts',
        where: [{ field: 'published', operator: 'eq', value: true }],
        select: ['id', 'title', 'authorId'],
      });
      expect(publishedPosts).toHaveLength(2);

      // Update user role
      await adapter.update({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u2' }],
        data: { role: 'admin' },
      });

      // Count admins
      const adminCount = await adapter.count({
        model: 'users',
        where: [{ field: 'role', operator: 'eq', value: 'admin' }],
      });
      expect(adminCount).toBe(2);

      // Cleanup
      await adapter.deleteMany({
        model: 'users',
        where: [{ field: 'active', operator: 'eq', value: false }],
      });

      const remainingUsers = await adapter.count({ model: 'users', where: [] });
      expect(remainingUsers).toBe(2);
    });
  });
});
