import { expect, it, vi } from 'vitest';
import { AnthropicChatModel } from '../src/models/anthropic.js';

it.each([['required', 'any'], ['none', 'none'], ['auto', 'auto']])('preserves system messages and maps %s tool choice', async (choice, expected) => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: 'm', content: [{ type: 'text', text: 'ok' }], usage: {} }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  try {
    const model = new AnthropicChatModel({ apiKey: 'test', model: 'claude-test', fetchImpl: fetch });
    await model.chat({ tool_choice: choice, messages: [{ role: 'system', content: 'first' }, { role: 'system', content: 'second' }, { role: 'user', content: 'hello' }] });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).system).toBe('first\n\nsecond');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).tool_choice).toEqual({ type: expected });
  } finally { vi.unstubAllGlobals(); }
});
