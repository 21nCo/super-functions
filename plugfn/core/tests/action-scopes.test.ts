import { expect, it, vi } from 'vitest';
import { ActionExecutor } from '../src/core/action-executor.js';
import { resolveActionContract } from '../src/core/action-manifest.js';
import { mockProvider, mockResponse } from '../src/testing/index.js';

it.each(['missing', 'refresh', 'granted'])('enforces required grants: %s', async mode => {
  const provider = mockProvider('test', { run: mockResponse({ ok: true }) });
  const execute = vi.fn(async () => ({ ok: true }));
  provider.actions.run.execute = execute;
  provider.actions.run.contract = { ...resolveActionContract(provider.actions.run), requiredScopes: ['write'] };
  const connection = { id: 'c', scopes: mode === 'missing' ? [] : ['write'], expiresAt: mode === 'refresh' ? new Date(0) : undefined };
  const manager = {
    markUsed: vi.fn(),
    resolveConnectionForAction: vi.fn().mockResolvedValueOnce(connection).mockResolvedValue({ ...connection, scopes: [] }),
    getCredentials: vi.fn(async () => ({ type: 'api-key', apiKey: 'key' })),
  };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const executor = new ActionExecutor(manager as any, { get: () => provider } as any, logger, { enableLogging: false, enableMetrics: false, enableRateLimit: false });
  const result = await executor.execute('test', 'run', { userId: 'u', params: {} });
  expect(result.success, String(result.error)).toBe(mode === 'granted');
  expect(execute).toHaveBeenCalledTimes(mode === 'granted' ? 1 : 0);
  if (mode === 'missing') expect(manager.getCredentials).not.toHaveBeenCalled();
});
