import { describe, it, expect } from 'vitest';
import { memoryfn, AddMemoryInput } from '../src';

describe('MemoryFn Pipeline', () => {
  it('rejects incompatible Postgres dimensions before opening a client', () => {
    expect(() => memoryfn({ storage: { kind: 'pg', url: 'postgres://unused' }, embedder: { provider: 'openai', apiKey: 'test', dims: 768 } }))
      .toThrow('MEMORY_EMBEDDING_DIMENSION_MISMATCH');
  });
  it('should initialize successfully', () => {
    const memory = memoryfn({
      storage: {
        kind: 'memory',
        path: ':memory:'
      }
    });
    expect(memory).toBeDefined();
  });

  it('should add a memory', async () => {
    const memory = memoryfn({
      storage: {
        kind: 'memory',
        path: ':memory:'
      }
    });

    const input: AddMemoryInput = {
      content: 'The sky is blue',
      tenantId: 'test',
      containerTags: ['user:test'],
      type: 'conversational'
    };

    const result = await memory.add(input);
    
    expect(result).toBeDefined();
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('The sky is blue');
    expect(result.summary.created).toBe(1);
  });

  it('rejects semantic search without an embedder', async () => {
    const memory = memoryfn({
      storage: {
        kind: 'memory',
        path: ':memory:'
      }
    });

    await memory.add({
      content: 'The sky is blue',
      tenantId: 'test',
      containerTags: ['user:test'],
      type: 'conversational'
    });

    await expect(memory.search({ q: 'sky', tenantId: 'test', containerTags: ['user:test'] }))
      .rejects.toThrow('MEMORY_EMBEDDER_REQUIRED');
  });
});
