import { expect, it, vi } from 'vitest';
import { AnthropicChatModel } from '../src/models/anthropic.js';

it('preserves ordered system messages in the provider request', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: 'm', content: [{ type: 'text', text: 'ok' }], usage: {} }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  try {
    const model = new AnthropicChatModel({ apiKey: 'test', model: 'claude-test' });
    await model.chat({ tool_choice: 'required', messages: [{ role: 'system', content: 'first' }, { role: 'system', content: 'second' }, { role: 'user', content: 'hello' }] });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).system).toBe('first\n\nsecond');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).tool_choice).toEqual({ type: 'any' });
  } finally { vi.unstubAllGlobals(); }
});
