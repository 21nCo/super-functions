/**
 * Example of using MockAdapter for testing
 */

import { createMockAdapter } from '../src/testing/mocks.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Mock Adapter - Testing Example');
  console.log('═══════════════════════════════════════════════════════\n');

  const mock = createMockAdapter();

  console.log('1️⃣  Basic mocking\n');

  // Set mock responses
  mock.setResponse('create', { id: 'test-id-123', name: 'Test User', email: 'test@example.com' });
  mock.setResponse('findOne', { id: 'test-id-123', name: 'Test User', email: 'test@example.com' });
  mock.setResponse('count', 42);

  // Use the mock
  const created = await mock.create({
    model: 'users',
    data: { name: 'Test User', email: 'test@example.com' },
  });
  console.log('   Created:', created);

  const found = await mock.findOne({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: 'test-id-123' }],
  });
  console.log('   Found:', found);

  const count = await mock.count({ model: 'users' });
  console.log('   Count:', count);

  console.log('\n2️⃣  Call tracking\n');

  // Check what was called
  console.log('   Was create called?', mock.wasCalled('create'));
  console.log('   Was delete called?', mock.wasCalled('delete'));
  console.log('   Create call count:', mock.getCallCount('create'));
  console.log('   Total call count:', mock.getCallCount());

  // Get call details
  const lastCreate = mock.getLastCall('create');
  console.log('\n   Last create call:');
  console.log('     Model:', lastCreate?.params.model);
  console.log('     Data:', lastCreate?.params.data);

  // Get all calls for a method
  const allFinds = mock.getCalls('findOne');
  console.log('\n   All findOne calls:', allFinds.length);

  console.log('\n3️⃣  Verifying calls with params\n');

  // Verify specific params
  const verifyResult = mock.verifyCall('create', {
    model: 'users',
    data: { name: 'Test User', email: 'test@example.com' },
  });
  console.log('   Create called with expected params?', verifyResult);

  console.log('\n4️⃣  Error mocking\n');

  // Reset and set error
  mock.reset();
  mock.setError('create', new Error('Database connection failed'));

  try {
    await mock.create({
      model: 'users',
      data: { name: 'Will Fail' },
    });
  } catch (error) {
    console.log('   ✅ Error thrown as expected:', (error as Error).message);
  }

  console.log('\n5️⃣  Reset and reuse\n');

  mock.reset();
  console.log('   Calls after reset:', mock.getCallCount());

  // Set new responses
  mock.setResponse('createMany', [
    { id: '1', name: 'User 1' },
    { id: '2', name: 'User 2' },
  ]);

  const batchResult = await mock.createMany({
    model: 'users',
    data: [{ name: 'User 1' }, { name: 'User 2' }],
  });
  console.log('   Batch create result:', batchResult);

  console.log('\n6️⃣  Example test pattern\n');

  mock.reset();

  // Simulate a library function that uses the adapter
  async function createUser(adapter: any, userData: any) {
    // Validate
    if (!userData.email) {
      throw new Error('Email is required');
    }

    // Create
    const user = await adapter.create({
      model: 'users',
      data: userData,
    });

    // Log creation
    await adapter.create({
      model: 'audit_log',
      data: {
        action: 'user_created',
        userId: user.id,
        timestamp: new Date(),
      },
    });

    return user;
  }

  // Setup mocks
  mock.setResponse('create', { id: 'new-user-123', name: 'John Doe', email: 'john@example.com' });

  // Test the function
  const result = await createUser(mock, { name: 'John Doe', email: 'john@example.com' });
  console.log('   Function result:', result);

  // Verify behavior
  console.log('\n   Verification:');
  console.log('     create() was called:', mock.getCallCount('create'), 'times');
  console.log('     First call was for:', mock.getCalls('create')[0].params.model);
  console.log('     Second call was for:', mock.getCalls('create')[1].params.model);

  const userCreated = mock.verifyCall('create', { model: 'users' });
  const auditLogged = mock.verifyCall('create', { model: 'audit_log' });
  console.log('     User was created:', userCreated);
  console.log('     Audit log was created:', auditLogged);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Mock testing example completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
