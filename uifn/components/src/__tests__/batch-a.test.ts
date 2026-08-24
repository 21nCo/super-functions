import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('batch-a registry contract', () => {
  for (const name of ['render', 'a11y', 'visual', 'recipe', 'registry']) {
    it(name, () => verifyRegistryBatch('batch-a'));
  }
});
