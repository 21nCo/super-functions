import { describe, it, expect } from 'vitest';

describe('@filefn/client', () => {
  it('should export createFileFnClient', async () => {
    const mod = await import('./index.js');
    expect(mod.createFileFnClient).toBeDefined();
    expect(typeof mod.createFileFnClient).toBe('function');
    expect(mod.generateFileId).toBeDefined();
    expect(mod.createHeicPreprocessor).toBeDefined();
  });
});
