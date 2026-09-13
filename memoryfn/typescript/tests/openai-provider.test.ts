import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createCompletion } = vi.hoisted(() => ({ createCompletion: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

import { OpenAILLM } from '../src/providers/llm/openai';

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
