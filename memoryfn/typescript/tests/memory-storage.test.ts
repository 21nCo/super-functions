import { describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from '../src/storage/memory/adapter';

describe('MemoryStorageAdapter', () => {
  it('persists memories and applies tag, metadata, threshold, and limit filters', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.insertMemories([
      {
        tenantId: 'tenant-a',
        containerTags: ['scope:a'],
        type: 'document',
        content: 'visible',
        embedding: [1, 0],
        metadata: { kind: 'note' },
        isLatest: true,
      },
      {
        tenantId: 'tenant-b',
        containerTags: ['scope:b'],
        type: 'document',
        content: 'hidden',
        embedding: [1, 0],
        metadata: { kind: 'note' },
        isLatest: true,
      },
      {
        tenantId: 'tenant-a',
        containerTags: ['scope:a'],
        type: 'document',
        content: 'wrong metadata',
        embedding: [1, 0],
        metadata: { kind: 'task' },
        isLatest: true,
      },
    ]);

    const results = await storage.searchVectors({
      tenantId: 'tenant-a',
      embedding: [1, 0],
      containerTags: ['scope:a'],
      filters: { kind: 'note' },
      threshold: 0.9,
      topK: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tenantId: 'tenant-a', content: 'visible' });
    results[0]!.content = 'mutated outside storage';
    await expect(storage.searchVectors({
      tenantId: 'tenant-a',
      embedding: [1, 0],
      containerTags: ['scope:a'],
      filters: { kind: 'note' },
      topK: 1,
    })).resolves.toEqual([expect.objectContaining({ content: 'visible' })]);
  });

  it('enforces tenant isolation even when records share the same container tag', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.insertMemories([
      {
        tenantId: 'tenant-a',
        containerTags: ['shared'],
        content: 'tenant a memory',
        embedding: [1, 0],
      },
      {
        tenantId: 'tenant-b',
        containerTags: ['shared'],
        content: 'tenant b memory',
        embedding: [1, 0],
      },
    ]);

    await expect(storage.searchVectors({
      tenantId: 'tenant-a',
      embedding: [1, 0],
      containerTags: ['shared'],
      topK: 10,
    })).resolves.toEqual([
      expect.objectContaining({ tenantId: 'tenant-a', content: 'tenant a memory' }),
    ]);
    await expect(storage.searchVectors({
      tenantId: 'tenant-a',
      embedding: [1, 0],
      containerTags: [],
      topK: 10,
    })).resolves.toEqual([
      expect.objectContaining({ tenantId: 'tenant-a', content: 'tenant a memory' }),
    ]);
  });

  it('matches nested JSON containment and deep-clones metadata in both directions', async () => {
    const storage = new MemoryStorageAdapter();
    const metadata = { profile: { roles: ['operator', 'auditor'], region: 'in-south' } };
    const [inserted] = await storage.insertMemories([{
      id: 'memory-nested',
      tenantId: 'default',
      containerTags: ['scope:a'],
      embedding: [1, 0],
      metadata,
    }]);
    metadata.profile.region = 'mutated';
    inserted!.metadata.profile = { roles: [], region: 'mutated-again' };

    const first = await storage.searchVectors({
      tenantId: 'default',
      embedding: [1, 0],
      containerTags: ['scope:a'],
      filters: { profile: { roles: ['auditor'], region: 'in-south' } },
      topK: 10,
    });
    expect(first).toHaveLength(1);
    (first[0]!.metadata.profile as { region: string }).region = 'outside';
    await expect(storage.searchVectors({
      tenantId: 'default',
      embedding: [1, 0],
      containerTags: ['scope:a'],
      filters: { profile: { region: 'in-south' } },
      topK: 10,
    })).resolves.toHaveLength(1);
  });

  it('rejects duplicate IDs atomically', async () => {
    const storage = new MemoryStorageAdapter();
    await expect(storage.insertMemories([
      { tenantId: 'default', containerTags: [], id: 'duplicate', embedding: [1, 0] },
      { tenantId: 'default', containerTags: [], id: 'duplicate', embedding: [1, 0] },
    ])).rejects.toThrow(/already exists/);
    await expect(storage.searchVectors({ tenantId: 'default', embedding: [1, 0], containerTags: [], topK: 10 })).resolves.toEqual([]);
  });

  it('excludes dimension-mismatched embeddings when no threshold is supplied', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.insertMemories([{ tenantId: 'default', containerTags: [], id: 'wrong-dimension', embedding: [1, 0, 0] }]);
    await expect(storage.searchVectors({ tenantId: 'default', embedding: [1, 0], containerTags: [], topK: 10 })).resolves.toEqual([]);
  });
});
