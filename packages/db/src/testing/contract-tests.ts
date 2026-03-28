/**
 * Contract tests for adapter compliance
 */

import type { Adapter, TableSchemaMap } from '../adapter/types.js';

export interface AdapterTestConfig {
  adapter: Adapter;
  namespace: string;
  testSchema: TableSchemaMap;
  capabilities?: string[];
  beforeEach?: () => Promise<void>;
  afterEach?: () => Promise<void>;
}

/**
 * Test adapter contract compliance
 * Use with your test framework (vitest, jest, etc.)
 */
export function testAdapterContract(config: AdapterTestConfig) {
  const { adapter, namespace } = config;

  return {
    /**
     * Test CRUD operations
     */
    testCRUD() {
      const tests: Array<{ name: string; test: () => Promise<void> }> = [];

      // Test create
      tests.push({
        name: 'should create a record',
        test: async () => {
          const data = { name: 'Test User', email: 'test@example.com', age: 25 };
          const result = await adapter.create({
            model: 'users',
            data,
            namespace,
          });

          if (!result || typeof result !== 'object') {
            throw new Error('Create should return an object');
          }
          if (!('id' in result)) {
            throw new Error('Created record should have an id');
          }
          if (result.name !== data.name) {
            throw new Error('Created record should contain the provided data');
          }
        },
      });

      // Test findOne
      tests.push({
        name: 'should find a record',
        test: async () => {
          const created = await adapter.create({
            model: 'users',
            data: { name: 'Find Me', email: 'find@example.com', age: 30 },
            namespace,
          });

          const found = await adapter.findOne({
            model: 'users',
            where: [{ field: 'id', operator: 'eq', value: created.id }],
            namespace,
          });

          if (!found) {
            throw new Error('Should find the created record');
          }
          if (found.id !== created.id) {
            throw new Error('Found record should match created record');
          }
        },
      });

      // Test findMany
      tests.push({
        name: 'should find multiple records',
        test: async () => {
          await adapter.create({
            model: 'users',
            data: { name: 'User 1', email: 'user1@example.com', age: 20 },
            namespace,
          });
          await adapter.create({
            model: 'users',
            data: { name: 'User 2', email: 'user2@example.com', age: 25 },
            namespace,
          });

          const results = await adapter.findMany({
            model: 'users',
            where: [],
            namespace,
          });

          if (!Array.isArray(results)) {
            throw new Error('findMany should return an array');
          }
          if (results.length < 2) {
            throw new Error('Should find at least 2 records');
          }
        },
      });

      // Test update
      tests.push({
        name: 'should update a record',
        test: async () => {
          const created = await adapter.create({
            model: 'users',
            data: { name: 'Update Me', email: 'update@example.com', age: 30 },
            namespace,
          });

          const updated = await adapter.update({
            model: 'users',
            where: [{ field: 'id', operator: 'eq', value: created.id }],
            data: { age: 31 },
            namespace,
          });

          if (updated.age !== 31) {
            throw new Error('Record should be updated');
          }
        },
      });

      // Test delete
      tests.push({
        name: 'should delete a record',
        test: async () => {
          const created = await adapter.create({
            model: 'users',
            data: { name: 'Delete Me', email: 'delete@example.com', age: 30 },
            namespace,
          });

          await adapter.delete({
            model: 'users',
            where: [{ field: 'id', operator: 'eq', value: created.id }],
            namespace,
          });

          const found = await adapter.findOne({
            model: 'users',
            where: [{ field: 'id', operator: 'eq', value: created.id }],
            namespace,
          });

          if (found !== null) {
            throw new Error('Record should be deleted');
          }
        },
      });

      if (adapter.capabilities.operations.strictUpdateNotFound) {
        tests.push({
          name: 'should throw NotFoundError on update with zero matched rows',
          test: async () => {
            try {
              await adapter.update({
                model: 'users',
                where: [{ field: 'id', operator: 'eq', value: 'missing-update-id' }],
                data: { age: 42 },
                namespace,
              });
              throw new Error('Expected NotFoundError for zero-row update');
            } catch (error: any) {
              if (error?.name !== 'NotFoundError') {
                throw new Error(`Expected NotFoundError, received ${error?.name || 'unknown error'}`);
              }
            }
          },
        });
      }

      return tests;
    },

    /**
     * Test batch operations
     */
    testBatch() {
      if (!adapter.capabilities.operations.batch) {
        return [];
      }

      const tests: Array<{ name: string; test: () => Promise<void> }> = [];

      tests.push({
        name: 'should create multiple records',
        test: async () => {
          const data = [
            { name: 'Batch 1', email: 'batch1@example.com', age: 20 },
            { name: 'Batch 2', email: 'batch2@example.com', age: 25 },
          ];

          const results = await adapter.createMany({
            model: 'users',
            data,
            namespace,
          });

          if (!Array.isArray(results)) {
            throw new Error('createMany should return an array');
          }
          if (results.length !== data.length) {
            throw new Error('Should create all records');
          }
        },
      });

      return tests;
    },

    /**
     * Test advanced operations
     */
    testAdvanced() {
      const tests: Array<{ name: string; test: () => Promise<void> }> = [];

      // Test count
      tests.push({
        name: 'should count records',
        test: async () => {
          await adapter.create({
            model: 'users',
            data: { name: 'Count 1', email: 'count1@example.com', age: 20 },
            namespace,
          });
          await adapter.create({
            model: 'users',
            data: { name: 'Count 2', email: 'count2@example.com', age: 25 },
            namespace,
          });

          const count = await adapter.count({
            model: 'users',
            namespace,
          });

          if (typeof count !== 'number' || count < 2) {
            throw new Error('Count should return the number of records');
          }
        },
      });

      // Test upsert (if supported)
      if (adapter.capabilities.operations.upsert) {
        tests.push({
          name: 'should upsert a record',
          test: async () => {
            const email = 'upsert@example.com';

            // First upsert (create)
            const result1 = await adapter.upsert({
              model: 'users',
              where: [{ field: 'email', operator: 'eq', value: email }],
              create: { name: 'Upsert User', email, age: 30 },
              update: { age: 31 },
              namespace,
            });

            if (!result1 || result1.age !== 30) {
              throw new Error('First upsert should create');
            }

            // Second upsert (update)
            const result2 = await adapter.upsert({
              model: 'users',
              where: [{ field: 'email', operator: 'eq', value: email }],
              create: { name: 'Upsert User', email, age: 30 },
              update: { age: 31 },
              namespace,
            });

            if (!result2 || result2.age !== 31) {
              throw new Error('Second upsert should update');
            }
          },
        });
      }

      return tests;
    },

    /**
     * Test lifecycle operations
     */
    testLifecycle() {
      const tests: Array<{ name: string; test: () => Promise<void> }> = [];

      tests.push({
        name: 'should initialize',
        test: async () => {
          await adapter.initialize();
        },
      });

      tests.push({
        name: 'should check health',
        test: async () => {
          const health = await adapter.isHealthy();
          if (typeof health !== 'object' || typeof health.healthy !== 'boolean') {
            throw new Error('isHealthy should return a health status object');
          }
        },
      });

      tests.push({
        name: 'should get/set schema version',
        test: async () => {
          await adapter.setSchemaVersion('test', 1);
          const version = await adapter.getSchemaVersion('test');
          if (version !== 1) {
            throw new Error('Schema version should be set and retrieved correctly');
          }
        },
      });

      return tests;
    },

    /**
     * Run all contract tests
     */
    async runAll() {
      const allTests = [
        ...this.testCRUD(),
        ...this.testBatch(),
        ...this.testAdvanced(),
        ...this.testLifecycle(),
      ];

      const results = {
        total: allTests.length,
        passed: 0,
        failed: 0,
        errors: [] as Array<{ name: string; error: Error }>,
      };

      for (const test of allTests) {
        try {
          if (config.beforeEach) {
            await config.beforeEach();
          }

          await test.test();
          results.passed++;

          if (config.afterEach) {
            await config.afterEach();
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            name: test.name,
            error: error as Error,
          });
        }
      }

      return results;
    },
  };
}

/**
 * Helper function to run contract tests with a test framework
 * Pass your test framework's describe, it, beforeEach, afterEach functions
 */
export function describeAdapterContract(
  name: string,
  config: AdapterTestConfig,
  describe: any,
  it: any,
  beforeEach?: any,
  afterEach?: any
) {
  describe(`Adapter Contract: ${name}`, () => {
    const tests = testAdapterContract(config);
    const crudTests = tests.testCRUD();
    const batchTests = tests.testBatch();
    const advancedTests = tests.testAdvanced();
    const lifecycleTests = tests.testLifecycle();

    describe('CRUD Operations', () => {
      if (beforeEach) {
        beforeEach(async () => {
          if (config.beforeEach) await config.beforeEach();
        });
      }

      if (afterEach) {
        afterEach(async () => {
          if (config.afterEach) await config.afterEach();
        });
      }

      for (const test of crudTests) {
        it(test.name, async () => {
          await test.test();
        });
      }
    });

    if (config.adapter.capabilities.operations.batch) {
      describe('Batch Operations', () => {
        if (beforeEach) {
          beforeEach(async () => {
            if (config.beforeEach) await config.beforeEach();
          });
        }

        if (afterEach) {
          afterEach(async () => {
            if (config.afterEach) await config.afterEach();
          });
        }

        for (const test of batchTests) {
          it(test.name, async () => {
            await test.test();
          });
        }
      });
    }

    describe('Advanced Operations', () => {
      if (beforeEach) {
        beforeEach(async () => {
          if (config.beforeEach) await config.beforeEach();
        });
      }

      if (afterEach) {
        afterEach(async () => {
          if (config.afterEach) await config.afterEach();
        });
      }

      for (const test of advancedTests) {
        it(test.name, async () => {
          await test.test();
        });
      }
    });

    describe('Lifecycle', () => {
      for (const test of lifecycleTests) {
        it(test.name, async () => {
          await test.test();
        });
      }
    });
  });
}
