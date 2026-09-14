import { describe, expect, it, vi } from 'vitest';
import { memoryfn } from '../src';
import { MemoryFn } from '../src/core/pipeline';
import { MemoryStorageAdapter } from '../src/storage/memory/adapter';

const valid = { content: 'A useful fact', type: 'conversational', confidence: 0.8, tags: ['topic'] };
describe('extraction input validation', () => {
  it.each([
    null, {}, { facts: null }, { facts: [null] }, { facts: [{}] },
    { facts: [valid, { ...valid, content: '' }] }, { facts: [{ ...valid, content: '   ' }] },
    { facts: [{ ...valid, type: 'invalid' }] }, { facts: [{ ...valid, confidence: NaN }] },
    { facts: [{ ...valid, confidence: Infinity }] }, { facts: [{ ...valid, confidence: -0.1 }] },
    { facts: [{ ...valid, confidence: 1.1 }] }, { facts: [{ ...valid, tags: [1] }] },
    { facts: [{ ...valid, tags: null }] }
  ])('rejects the entire malformed batch before any embedding or persistence: %# %j', async result => {
    const storage = new MemoryStorageAdapter(); const insert = vi.spyOn(storage, 'insertMemories');
    const embedder = { embed: vi.fn(async () => [1, 0]), embedBatch: vi.fn(async () => [[1, 0]]) };
    const fn = new MemoryFn({ storage: { kind: 'adapter', adapter: storage } }, storage, embedder, { generateJSON: async () => result } as any);
    await expect(fn.add({ tenantId: 't', containerTags: [], content: 'extract me' })).rejects.toThrow('MEMORY_EXTRACTION_INVALID');
    expect(insert).not.toHaveBeenCalled(); expect(embedder.embed).not.toHaveBeenCalled(); expect(embedder.embedBatch).not.toHaveBeenCalled();
  });
  it('accepts empty batches and validates real facts', async () => {
    for (const facts of [[], [valid]]) {
      const storage = new MemoryStorageAdapter();
      const fn = new MemoryFn({ storage: { kind: 'adapter', adapter: storage } }, storage, undefined, { generateJSON: async () => ({ facts }) } as any);
      expect((await fn.add({ tenantId: 't', containerTags: [], content: 'extract me' })).memories).toHaveLength(facts.length);
    }
  });
  it.each(['hf', 'fastembed'] as const)('rejects unimplemented embedder %s at construction', provider => {
    expect(() => memoryfn({ storage: { kind: 'pg', url: 'postgres://unused' }, embedder: { provider, model: 'test' } as any })).toThrow('MEMORY_EMBEDDER_UNSUPPORTED');
  });
});

it.each(['anthropic', 'google', 'ollama'])('rejects unsupported LLM %s instead of storing raw text', provider => {
  expect(() => memoryfn({ storage: { kind: 'memory' }, llm: { provider, model: 'test' } as any })).toThrow('MEMORY_LLM_UNSUPPORTED');
});

it.each(['hash', 'mask', 'drop'])('rejects unsupported redaction mode %s in factory and direct constructor', mode => {
  const config = { storage: { kind: 'memory' as const }, policies: { redaction: { patterns: ['secret'], mode } } } as any;
  expect(() => memoryfn(config)).toThrow('MEMORY_REDACTION_UNSUPPORTED');
  expect(() => new MemoryFn(config, new MemoryStorageAdapter())).toThrow('MEMORY_REDACTION_UNSUPPORTED');
});
