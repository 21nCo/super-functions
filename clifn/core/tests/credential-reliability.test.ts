import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCredentialStore } from '../src/credentials.js';
import { createApiClient } from '../src/client.js';
describe('credential and retry reliability', () => {
  it('preserves credentials on a competing lock and writes private files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clifn-lock-'));
    try {
      const path = join(dir, 'credentials'); const store = createCredentialStore(path);
      store.setProfile('one', { backend: 'https://example.test', key: 'secret' });
      const previous = readFileSync(path, 'utf8'); writeFileSync(path + '.lock', 'other-writer');
      expect(() => store.setProfile('two', { backend: 'https://example.test', key: 'other' })).toThrow('BUSY');
      expect(readFileSync(path, 'utf8')).toBe(previous);
      expect(existsSync(path + '.lock')).toBe(true);
      if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not replay an uncertain write, but allows explicit safe-operation retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network lost'));
    const client = createApiClient({ baseUrl: 'https://example.test', apiKey: 'test', retries: 2, retryDelayMs: 0, fetchImpl });
    await expect(client.post('/write', {})).rejects.toThrow(); expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockClear();
    await expect(client.request({ method: 'POST', path: '/idempotent', body: {}, retrySafe: true })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
