import { describe, it, expect } from 'vitest';
import { createFileFn } from './index.js';

describe('@filefn/server', () => {
  it('should export createFileFn', () => {
    expect(createFileFn).toBeDefined();
  });
});
