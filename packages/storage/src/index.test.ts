import { describe, it, expect } from 'vitest';

describe('storage', () => {
  it('should export types', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });
});
