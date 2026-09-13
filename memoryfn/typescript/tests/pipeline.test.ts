import { describe, it, expect } from 'vitest';
import { memoryfn, AddMemoryInput } from '../src';

describe('MemoryFn Pipeline', () => {
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

  it('should persist and search memories in the process-local adapter', async () => {
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

    const result = await memory.search({
      q: 'sky',
      tenantId: 'test',
      containerTags: ['user:test']
    });

    expect(result).toBeDefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.content).toBe('The sky is blue');
  });
});
