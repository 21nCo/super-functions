import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createCompletion, createEmbedding } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  createEmbedding: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
    embeddings = { create: createEmbedding };
  },
}));

import { OpenAILLM } from '../src/providers/llm/openai';
import { OpenAIEmbedder } from '../src/providers/embed/openai';

describe('OpenAILLM structured output', () => {
  beforeEach(() => {
    createCompletion.mockReset();
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '{"value":"ok"}' } }] });
  });

  it('passes the caller schema through the OpenAI json_schema contract', async () => {
    const schema = {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    };
    const llm = new OpenAILLM({ apiKey: 'test-key' });

    await expect(llm.generateJSON('Return a value.', schema)).resolves.toEqual({ value: 'ok' });
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'memoryfn_output', strict: true, schema },
      },
    }));
  });
});

describe('OpenAIEmbedder batching', () => {
  beforeEach(() => createEmbedding.mockReset());

  it('batches within provider limits and restores response index order', async () => {
    createEmbedding
      .mockResolvedValueOnce({ data: [
        { index: 1, embedding: [2] },
        { index: 0, embedding: [1] },
      ] })
      .mockResolvedValueOnce({ data: [{ index: 0, embedding: [3] }] });

    const embedder = new OpenAIEmbedder({ apiKey: 'test-key', batchSize: 2 });
    await expect(embedder.embedBatch(['one', 'two', 'three'])).resolves.toEqual([[1], [2], [3]]);
    expect(createEmbedding).toHaveBeenCalledTimes(2);
  });

  it('rejects incomplete provider response indices', async () => {
    createEmbedding.mockResolvedValue({ data: [{ index: 1, embedding: [2] }] });
    const embedder = new OpenAIEmbedder({ apiKey: 'test-key', batchSize: 2 });
    await expect(embedder.embedBatch(['one', 'two'])).rejects.toThrow('MEMORY_EMBEDDING_RESPONSE_MISMATCH');
  });
});
