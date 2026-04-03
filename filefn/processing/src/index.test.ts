import { describe, it, expect } from 'vitest';
import { createPipeline } from './index.js';

describe('@filefn/processing', () => {
  it('should export createPipeline', () => {
    expect(createPipeline).toBeDefined();
  });
});
