/**
 * Complete example using the memory adapter
 */

import { memoryAdapter, createSchemaTracker } from '../src/index.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  @superfunctions/db - Memory Adapter Example');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Create adapter with namespace support
  console.log('1️⃣  Creating adapter...');
  const adapter = memoryAdapter({
    namespace: { enabled: true, separator: '_' },
    debug: false,
  });
  console.log('   ✅ Adapter created:', adapter.name);
  console.log('   📦 Namespace support:', adapter.capabilities.advanced.schemaNamespaces ? 'Yes' : 'No');
  console.log('   🔄 Batch operations:', adapter.capabilities.operations.batch ? 'Yes' : 'No\n');

  // 2. CRUD Operations
  console.log('2️⃣  CRUD Operations\n');

  // Create
  console.log('   Creating users...');
  const user1 = await adapter.create({
    model: 'users',
    data: { name: 'Alice Johnson', email: 'alice@example.com', age: 28, role: 'admin' },
    namespace: 'app',
  });
  console.log('   ✅ Created:', user1.name, `(ID: ${user1.id})`);

  const user2 = await adapter.create({
    model: 'users',
    data: { name: 'Bob Smith', email: 'bob@example.com', age: 35, role: 'user' },
    namespace: 'app',
  });
  console.log('   ✅ Created:', user2.name, `(ID: ${user2.id})`);

  // Read
  console.log('\n   Finding user by email...');
  const found = await adapter.findOne({
    model: 'users',
    where: [{ field: 'email', operator: 'eq', value: 'alice@example.com' }],
    namespace: 'app',
  });
  console.log('   ✅ Found:', found?.name);

  // Update
  console.log('\n   Updating user age...');
  const updated = await adapter.update({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: user1.id }],
    data: { age: 29 },
    namespace: 'app',
  });
  console.log('   ✅ Updated:', updated.name, `age -> ${updated.age}`);

  // 3. Batch Operations
  console.log('\n3️⃣  Batch Operations\n');

  const batchUsers = await adapter.createMany({
    model: 'users',
    data: [
      { name: 'Charlie Brown', email: 'charlie@example.com', age: 25, role: 'user' },
      { name: 'Diana Prince', email: 'diana@example.com', age: 32, role: 'moderator' },
      { name: 'Eve Adams', email: 'eve@example.com', age: 27, role: 'user' },
    ],
    namespace: 'app',
  });
  console.log(`   ✅ Created ${batchUsers.length} users in batch`);

  // 4. Advanced Queries
  console.log('\n4️⃣  Advanced Queries\n');

  // Find with filtering
  console.log('   Finding users with age >= 30...');
  const olderUsers = await adapter.findMany({
    model: 'users',
    where: [{ field: 'age', operator: 'gte', value: 30 }],
    namespace: 'app',
  });
  console.log(`   ✅ Found ${olderUsers.length} users:`);
  olderUsers.forEach((u) => console.log(`      - ${u.name} (${u.age})`));

  // Find with ordering
  console.log('\n   Finding all users ordered by age...');
  const orderedUsers = await adapter.findMany({
    model: 'users',
    where: [],
    orderBy: [{ field: 'age', direction: 'asc' }],
    namespace: 'app',
  });
  console.log(`   ✅ Found ${orderedUsers.length} users (youngest to oldest):`);
  orderedUsers.forEach((u) => console.log(`      - ${u.name} (${u.age})`));

  // Find with pagination
  console.log('\n   Finding users with pagination (limit: 2, offset: 1)...');
  const paginatedUsers = await adapter.findMany({
    model: 'users',
    where: [],
    limit: 2,
    offset: 1,
    orderBy: [{ field: 'name', direction: 'asc' }],
    namespace: 'app',
  });
  console.log(`   ✅ Found ${paginatedUsers.length} users (page 2):`);
  paginatedUsers.forEach((u) => console.log(`      - ${u.name}`));

  // Count
  console.log('\n   Counting total users...');
  const totalUsers = await adapter.count({
    model: 'users',
    namespace: 'app',
  });
  console.log(`   ✅ Total users: ${totalUsers}`);

  // 5. Upsert
  console.log('\n5️⃣  Upsert Operation\n');

  console.log('   First upsert (create)...');
  const upsert1 = await adapter.upsert({
    model: 'settings',
    where: [{ field: 'key', operator: 'eq', value: 'theme' }],
    create: { key: 'theme', value: 'dark' },
    update: { value: 'light' },
    namespace: 'app',
  });
  console.log('   ✅ Result:', upsert1);

  console.log('\n   Second upsert (update)...');
  const upsert2 = await adapter.upsert({
    model: 'settings',
    where: [{ field: 'key', operator: 'eq', value: 'theme' }],
    create: { key: 'theme', value: 'dark' },
    update: { value: 'light' },
    namespace: 'app',
  });
  console.log('   ✅ Result:', upsert2);

  // 6. Schema Versioning
  console.log('\n6️⃣  Schema Versioning\n');

  const tracker = createSchemaTracker(adapter);

  console.log('   Setting schema versions...');
  await tracker.setVersion('app', 1);
  await tracker.setVersion('notifications', 2);
  console.log('   ✅ Versions set');

  console.log('\n   Checking version status...');
  const status1 = await tracker.getVersionStatus('app', 1);
  const status2 = await tracker.getVersionStatus('notifications', 3);
  console.log(`   📦 app: v${status1.current} (required: v${status1.required}) - ${status1.status}`);
  console.log(`   📦 notifications: v${status2.current} (required: v${status2.required}) - ${status2.status}`);

  console.log('\n   Getting all versions...');
  const allVersions = await tracker.getAllVersions();
  console.log('   ✅ All versions:', allVersions);

  // 7. Health Check
  console.log('\n7️⃣  Health Check\n');

  const health = await adapter.isHealthy();
  console.log('   ✅ Adapter health:', {
    healthy: health.healthy,
    uptime: `${Math.round(health.uptime / 1000)}s`,
  });

  // 8. Cleanup
  console.log('\n8️⃣  Cleanup\n');

  console.log('   Deleting a user...');
  await adapter.delete({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: user2.id }],
    namespace: 'app',
  });
  console.log('   ✅ User deleted');

  const remainingUsers = await adapter.count({
    model: 'users',
    namespace: 'app',
  });
  console.log(`   📊 Remaining users: ${remainingUsers}`);

  // Close adapter
  await adapter.close();
  console.log('\n   ✅ Adapter closed');

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Example completed successfully! ');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
