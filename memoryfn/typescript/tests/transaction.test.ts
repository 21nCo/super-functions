import { expect, it } from 'vitest';
import { MemoryStorageAdapter } from '../src/storage/memory/adapter';
import { ConflictResolver } from '../src/extraction/resolver';
import { MemoryFn } from '../src/core/pipeline';

it('rolls back staged writes and rejects a concurrent commit without losing it', async () => {
  const storage = new MemoryStorageAdapter();
  const input = { tenantId: 't', containerTags: ['c'], content: 'old', embedding: [1, 0] };
  const [old] = await storage.insertMemories([input]);
  await expect(storage.transaction(async tx => {
    await tx.insertMemories([{ ...input, id: 'orphan' }]);
    await tx.updateMemory({ tenantId: 't', containerTags: ['c'], id: old.id, expectedRevision: 999, changes: { content: 'old', embedding: [1, 0], isLatest: false } });
  })).rejects.toThrow();
  expect(await storage.getMemory({ ...input, id: 'orphan' })).toBeNull();
  await expect(storage.transaction(async tx => {
    await tx.insertMemories([{ ...input, id: 'staged' }]);
    await storage.insertMemories([{ ...input, id: 'concurrent' }]);
  })).rejects.toThrow('MEMORY_REVISION_CONFLICT');
  expect(await storage.getMemory({ ...input, id: 'staged' })).toBeNull();
  expect(await storage.getMemory({ ...input, id: 'concurrent' })).not.toBeNull();
});

it('does not retain a new conflict record when its superseding revision fails', async () => {
  const storage = new MemoryStorageAdapter();
  const [old] = await storage.insertMemories([{ tenantId: 't', containerTags: ['c'], content: 'old', embedding: [1, 0] }]);
  const memory = new MemoryFn({ storage: { kind: 'memory' } }, storage, { embedBatch: async () => [[1, 0]], embed: async () => [1, 0] } as any);
  (memory as any).extractor = { extract: async () => [{ content: 'new', type: 'fact', tags: [], confidence: 1 }] };
  (memory as any).deduplicator = { findDuplicate: async () => false };
  (memory as any).resolver = { resolve: async () => ({ type: 'updates' }) };
  const search = storage.searchVectors.bind(storage);
  storage.searchVectors = async input => (await search(input)).map(row => ({ ...row, revision: 999 }));
  await expect(memory.add({ tenantId: 't', containerTags: ['c'], content: 'new' })).rejects.toThrow();
  const records = await search({ tenantId: 't', containerTags: ['c'], embedding: [1, 0], topK: 10 });
  expect(records.map(row => row.id)).toEqual([old.id]);
});

it('does not invalidate a writer for overlapping no-op operations', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.transaction(async tx => {
    await tx.insertMemories([{ tenantId: 't', containerTags: ['c'], content: 'value', id: 'kept' }]);
    await storage.transaction(async () => {});
    await storage.insertMemories([]);
    await storage.insertRelationships([]);
  });
  expect(await storage.getMemory({ tenantId: 't', containerTags: ['c'], id: 'kept' })).not.toBeNull();
});

it('propagates resolver errors and rejects malformed resolutions', async () => {
  const existing = { content: 'old' } as any;
  const failing = new ConflictResolver({ generateJSON: async () => { throw new Error('provider unavailable'); } } as any);
  await expect(failing.resolve('new', existing)).rejects.toThrow('provider unavailable');
  const invalid = new ConflictResolver({ generateJSON: async () => ({ type: 'invented' }) } as any);
  await expect(invalid.resolve('new', existing)).rejects.toThrow('MEMORY_RESOLUTION_INVALID');
});
