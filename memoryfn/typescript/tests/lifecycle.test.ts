import { describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from '../src/storage/memory/adapter';
import { MemoryFn } from '../src/core/pipeline';
describe('memory lifecycle and scope', () => {
  it('requires an explicit tenant and all requested tags', async () => {
    const store = new MemoryStorageAdapter();
    await expect(store.insertMemories([{ content: 'secret' }])).rejects.toThrow('SCOPE');
    await store.insertMemories([{ id: 'one', tenantId: 'a', containerTags: ['shared'], content: 'secret', embedding: [1, 0] }]);
    // @ts-expect-error Direct vector searches require an explicit tenant boundary.
    await expect(store.searchVectors({ embedding: [1, 0], containerTags: [], topK: 10 })).rejects.toThrow('SCOPE');
    for (const scope of [{ tenantId: 'b', containerTags: [] }, { tenantId: 'a', containerTags: ['shared', 'private'] }]) {
      expect(await store.searchVectors({ ...scope, embedding: [1, 0], topK: 10 })).toEqual([]);
    }
  });
  it('allows only one concurrent revision and atomically replaces the embedding', async () => {
    const store = new MemoryStorageAdapter(); const scope = { id: 'one', tenantId: 'a', containerTags: ['private'] };
    await store.insertMemories([{ ...scope, content: 'old', embedding: [1, 0] }]);
    const results = await Promise.allSettled([1, 2].map(() => store.updateMemory({ ...scope, expectedRevision: 1, changes: { content: 'new', embedding: [0, 1] } })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.getMemory(scope)).toMatchObject({ revision: 2, content: 'new', embedding: [0, 1] });
    expect(await store.searchVectors({ ...scope, embedding: [1, 0], threshold: 0.9, topK: 10 })).toEqual([]);
  });
  it('forget is retryable, removes retrieval and prevents stale update or id resurrection', async () => {
    const store = new MemoryStorageAdapter(); const scope = { id: 'one', tenantId: 'a', containerTags: [] };
    await store.insertMemories([{ ...scope, content: 'secret', embedding: [1, 0] }]);
    await store.deleteMemory(scope); await store.deleteMemory(scope);
    expect(await store.getMemory(scope)).toBeNull();
    expect(await store.searchVectors({ ...scope, embedding: [1, 0], topK: 10 })).toEqual([]);
    await expect(store.updateMemory({ ...scope, expectedRevision: 1, changes: { content: 'stale', embedding: [1, 0] } })).rejects.toThrow();
    await expect(store.insertMemories([{ ...scope, content: 'resurrect' }])).rejects.toThrow();
  });
  it('does not persist an update if its embedding fails', async () => {
    const store = new MemoryStorageAdapter(); const scope = { id: 'one', tenantId: 'a', containerTags: [] };
    await store.insertMemories([{ ...scope, content: 'old', embedding: [1, 0] }]);
    const fn = new MemoryFn({ storage: { kind: 'adapter', adapter: store } }, store, { embed: async () => { throw new Error('offline'); }, embedBatch: async () => [] } as any);
    await expect(fn.update({ ...scope, expectedRevision: 1, content: 'new' })).rejects.toThrow('offline');
    expect(await store.getMemory(scope)).toMatchObject({ content: 'old', revision: 1 });
  });
});

it('preserves metadata through public content-only updates and supports replacement', async () => {
  const store = new MemoryStorageAdapter();
  const scope = {tenantId:'t',containerTags:['w']};
  const fn = new MemoryFn({storage:{kind:'adapter',adapter:store}},store,
    {embed:async()=>[1,0],embedBatch:async(values:string[])=>values.map(()=>[1,0])});
  const {memories:[saved]} = await fn.add({...scope,content:'old',metadata:{source:'audit'}});
  const updated = await fn.update({...scope,id:saved.id,expectedRevision:1,content:'new'});
  expect(updated.metadata).toMatchObject({source:'audit'});
  expect((await fn.search({...scope,q:'new',filters:{source:'audit'}})).results).toHaveLength(1);
  await fn.update({...scope,id:saved.id,expectedRevision:2,content:'newer',metadata:{source:'replacement'}});
  expect((await fn.search({...scope,q:'new',filters:{source:'audit'}})).results).toHaveLength(0);
  expect((await fn.search({...scope,q:'new',filters:{source:'replacement'}})).results).toHaveLength(1);
});

it('does not silently accept failed LLM extraction without an embedder', async () => {
  const storage = new MemoryStorageAdapter();
  const fn = new MemoryFn({ storage: { kind: 'adapter', adapter: storage } }, storage, undefined, { generateJSON: async () => { throw new Error('provider unavailable'); } } as any);
  await expect(fn.add({ tenantId: 't', containerTags: [], content: 'must survive' })).rejects.toThrow('provider unavailable');
});
