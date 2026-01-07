/**
 * Example of using contract tests to validate adapters
 */

import { memoryAdapter } from '../src/adapters/memory/index.js';
import { testAdapterContract } from '../src/testing/contract-tests.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Contract Testing Example');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('This example shows how to use contract tests to validate');
  console.log('that an adapter properly implements the Adapter interface.\n');

  // Create an adapter to test
  const adapter = memoryAdapter({
    namespace: { enabled: true },
  });

  // Create test configuration
  const testConfig = {
    adapter,
    namespace: 'test',
    testSchema: {
      users: {
        modelName: 'users',
        fields: {
          id: { type: 'string' as const, required: true },
          name: { type: 'string' as const, required: true },
          email: { type: 'string' as const, required: true },
          age: { type: 'number' as const },
        },
      },
    },
    beforeEach: async () => {
      // Clean up before each test
      console.log('  [Setup] Cleaning test data...');
    },
    afterEach: async () => {
      // Clean up after each test
      console.log('  [Teardown] Test completed');
    },
  };

  // Get test suite
  const tests = testAdapterContract(testConfig);

  console.log('1️⃣  Running CRUD tests...\n');
  const crudTests = await tests.testCRUD();
  for (const test of crudTests) {
    try {
      await test.test();
      console.log(`   ✅ ${test.name}`);
    } catch (error) {
      console.log(`   ❌ ${test.name}`);
      console.log(`      Error: ${(error as Error).message}`);
    }
  }

  console.log('\n2️⃣  Running batch operation tests...\n');
  const batchTests = await tests.testBatch();
  if (batchTests.length > 0) {
    for (const test of batchTests) {
      try {
        await test.test();
        console.log(`   ✅ ${test.name}`);
      } catch (error) {
        console.log(`   ❌ ${test.name}`);
        console.log(`      Error: ${(error as Error).message}`);
      }
    }
  } else {
    console.log('   ⚠️  Batch operations not supported by this adapter');
  }

  console.log('\n3️⃣  Running advanced operation tests...\n');
  const advancedTests = await tests.testAdvanced();
  for (const test of advancedTests) {
    try {
      await test.test();
      console.log(`   ✅ ${test.name}`);
    } catch (error) {
      console.log(`   ❌ ${test.name}`);
      console.log(`      Error: ${(error as Error).message}`);
    }
  }

  console.log('\n4️⃣  Running lifecycle tests...\n');
  const lifecycleTests = await tests.testLifecycle();
  for (const test of lifecycleTests) {
    try {
      await test.test();
      console.log(`   ✅ ${test.name}`);
    } catch (error) {
      console.log(`   ❌ ${test.name}`);
      console.log(`      Error: ${(error as Error).message}`);
    }
  }

  console.log('\n5️⃣  Running all tests together...\n');
  const results = await tests.runAll();

  console.log('   Test Results:');
  console.log(`     Total tests: ${results.total}`);
  console.log(`     Passed: ${results.passed}`);
  console.log(`     Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n   Failed tests:');
    results.errors.forEach((err) => {
      console.log(`     - ${err.name}: ${err.error.message}`);
    });
  }

  console.log('\n6️⃣  Integration with test frameworks\n');
  console.log('   In a real test file with vitest/jest, you would use:');
  console.log('');
  console.log('   import { describe, it, beforeEach, afterEach } from "vitest";');
  console.log('   import { describeAdapterContract } from "@superfunctions/db/testing";');
  console.log('');
  console.log('   describeAdapterContract(');
  console.log('     "Memory Adapter",');
  console.log('     testConfig,');
  console.log('     describe,');
  console.log('     it,');
  console.log('     beforeEach,');
  console.log('     afterEach');
  console.log('   );');

  await adapter.close();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Contract testing example completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
