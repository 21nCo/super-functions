import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('batch-b registry contract', () => {
  for (const name of ['render', 'a11y', 'interaction', 'visual', 'registry']) {
    it(name, () => verifyRegistryBatch('batch-b'));
  }
});
