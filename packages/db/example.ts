/**
 * Example usage of @superfunctions/db
 */

import { memoryAdapter } from './src/adapters/memory/index.js';

async function main() {
  console.log('🚀 Testing @superfunctions/db\n');

  // Create memory adapter
  const adapter = memoryAdapter({
    namespace: { enabled: true, separator: '_' },
    debug: false,
  });

  console.log('✅ Adapter created:', adapter.name);
  console.log('📋 Capabilities:', {
    batch: adapter.capabilities.operations.batch,
    upsert: adapter.capabilities.operations.upsert,
    transactions: adapter.capabilities.transactions.supported,
  });
  console.log('');

  // Create a user
  console.log('Creating a user...');
  const user = await adapter.create({
    model: 'users',
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    },
    namespace: 'myapp',
  });
  console.log('✅ Created:', user);
  console.log('');

  // Find the user
  console.log('Finding the user...');
  const found = await adapter.findOne({
    model: 'users',
    where: [{ field: 'email', operator: 'eq', value: 'john@example.com' }],
    namespace: 'myapp',
  });
  console.log('✅ Found:', found);
  console.log('');

  // Update the user
  console.log('Updating the user...');
  const updated = await adapter.update({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: user.id }],
    data: { age: 31 },
    namespace: 'myapp',
  });
  console.log('✅ Updated:', updated);
  console.log('');

  // Create multiple users
  console.log('Creating multiple users...');
  const users = await adapter.createMany({
    model: 'users',
    data: [
      { name: 'Alice', email: 'alice@example.com', age: 25 },
      { name: 'Bob', email: 'bob@example.com', age: 35 },
    ],
    namespace: 'myapp',
  });
  console.log('✅ Created:', users.length, 'users');
  console.log('');

  // Find all users
  console.log('Finding all users...');
  const allUsers = await adapter.findMany({
    model: 'users',
    where: [],
    orderBy: [{ field: 'age', direction: 'asc' }],
    namespace: 'myapp',
  });
  console.log('✅ Found:', allUsers.length, 'users');
  allUsers.forEach((u) => console.log(`  - ${u.name} (${u.age})`));
  console.log('');

  // Count users
  const count = await adapter.count({
    model: 'users',
    namespace: 'myapp',
  });
  console.log('✅ Total users:', count);
  console.log('');

  // Check health
  const health = await adapter.isHealthy();
  console.log('✅ Adapter health:', health);
  console.log('');

  // Schema versioning
  console.log('Testing schema versioning...');
  await adapter.setSchemaVersion('myapp', 1);
  const version = await adapter.getSchemaVersion('myapp');
  console.log('✅ Schema version:', version);
  console.log('');

  // Clean up
  await adapter.close();
  console.log('✅ Adapter closed');
}

main().catch(console.error);
