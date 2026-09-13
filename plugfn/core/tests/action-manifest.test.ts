import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createActionManifest, resolveActionContract, redactActionTelemetry } from '../src/core/action-manifest.js';
import type { Action } from '../src/types/action.js';
const action: Action = { name: 'test', displayName: 'Test', description: '', parameters: z.object({}), returns: z.object({}), execute: async () => ({}) };
describe('versioned action contracts', () => {
  it('does not infer reads or retries from missing contracts', () => {
    expect(resolveActionContract({ ...action, idempotent: true })).toMatchObject({ effect: 'unknown', retry: 'never' });
  });
  it('hashes JSON deterministically and detects scope or schema changes', async () => {
    const a = await createActionManifest('p', action, { input: { b: 2, a: 1 }, output: {} });
    const b = await createActionManifest('p', action, { input: { a: 1, b: 2 }, output: {} });
    expect(a.hash).toBe(b.hash);
    const c = await createActionManifest('p', { ...action, contract: { ...resolveActionContract(action), requiredScopes: ['new'] } }, { input: { a: 1, b: 2 }, output: {} });
    expect(a.hash).not.toBe(c.hash);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
  it('rejects unsafe unknown retry metadata and redacts declared sensitive keys recursively', () => {
    expect(() => resolveActionContract({ ...action, contract: { ...resolveActionContract(action), retry: 'safe' } })).toThrow();
    const marked = { ...action, contract: { ...resolveActionContract(action), sensitiveKeys: ['privateNote'] } };
    expect(redactActionTelemetry(marked, { nested: { privateNote: 'secret', label: 'safe' } })).toEqual({ nested: { privateNote: '[REDACTED]', label: 'safe' } });
  });
});
